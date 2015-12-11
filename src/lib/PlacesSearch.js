'use strict';

// This class searches the Places DB for us, answering these questions:
// - Given a user-typed string, are there matching history entries?
// - Given a retrieved history entry, is it a bookmark? a currently-open tab?
//
// Our main query is a simplified version of the default query used in the
// existing autocomplete code, which is very similar across both the new
// (UnifiedComplete) and old (nsPlacesAutoComplete) implementations in FF.
//
// Non-optimizations to consider when/if we optimize for performance:
// - Existing code stores its own list of all open windows in an in-memory
//   SQLite table. I have no idea how the performance compares to just using
//   the global list of windows/tabs maintained by nsSessionStore.
// - We don't worry about Places keywords or tags. This includes ignoring
//   special characters like '^', which can be used to limit searches to
//   subsets of history--definitely not a mainstream feature.
// - We don't worry about adaptive searches, or really, nearly any of the
//   edge cases explicitly considered here:
//   https://dxr.mozilla.org/mozilla-central/source/ (url continues)
//     toolkit/components/places/UnifiedComplete.js#865-874
// - UnifiedComplete does large multi-joins, rather than a series of simple
//   queries. I'm not sure what performance gains are possible with
//   more complex queries, but I don't expect much from SQLite in terms of
//   query planning and execution. We also don't have a remote DB, so the
//   common network latency issues don't apply. Basically, it'll be neat
//   to get some hard numbers around this later.
// - We don't worry about whether a query was typed by the user or not.
//   This corresponds to BOOKMARKED_HOST_QUERY and related constants in the
//   existing code.

/* global Components, PlacesUtils, Services, SessionStore, Task, XPCOMUtils */

const {utils: Cu, interfaces: Ci, classes: Cc} = Components;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'console',
  'resource://gre/modules/devtools/Console.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'PlacesUtils',
  'resource://gre/modules/PlacesUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'SessionStore',
  'resource:///modules/sessionstore/SessionStore.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Task',
  'resource://gre/modules/Task.jsm');

const EXPORTED_SYMBOLS = ['PlacesSearch']; // eslint-disable-line no-unused-vars


function PlacesSearch() {}
PlacesSearch.prototype = {

  // This function returns the base history query used by the existing
  // autocomplete code. Given an optional SQL query fragment (`conditions`),
  // which we don't currently use, return a SQL query which fetches fuzzy
  // matches from the Places DB, sorted in frecency order.
  //
  // Because we're reusing the current base query, this function documents
  // some facts about the current search behavior that are either undocumented
  // or sparsely documented across lots of files.
  //
  // Frecency is a decaying measure of frequency + recency of visits to a URL.
  // It is an integer >= 0, with no maximum value. Its value is roughly:
  //   frecency = (visit_count * visit_type) for the 10 most recent visits,
  // where visit_type is based on whether the URL was typed, clicked, etc. The
  // detailed weighting behavior is defined in nsNavHistory, and is driven by a
  // huge number of configurable preferences given there.
  //
  // Frecency decays by 0.975 per day, so that the value for a given site drops
  // by half if the page is not visited for 28 days. nsNavHistory::DecayFrecency
  // contains the implementation and additional details.
  //
  // See also MDN: https://mdn.io/Frecency_algorithm.
  //
  // The actual frecency calculation is in components/places/SQLFunctions.cpp.
  //
  // AUTOCOMPLETE_MATCH is a sqlite function, also defined in SQLFunctions.cpp.
  defaultQuery: function(conditions = '') {
    // Start by defining some constants used in the search:

    // This constant corresponds to the :query_type variable, which could take
    // any of these values:
    //   - QUERYTYPE_FILTERED, used by the main search query and adaptive query
    //   - QUERYTYPE_AUTOFILL_HOST, used for urlbar autofill of domain names,
    //   - QUERYTYPE_AUTOFILL_URL, used for urlbar autofill of complete urls.
    // QUERYTYPE_FILTERED seems like a good choice, since we're not (currently)
    // concerned with autofilling the urlbar.
    // This constant is defined in UnifiedComplete.js, not in any interface, so
    // we'll just assign its numeric value directly here.
    const QUERY_TYPE = 0; // QUERYTYPE_FILTERED

    // This constant corresponds to the :matchBehavior variable, which is passed
    // to the AUTOCOMPLETE_MATCH function.
    //   - It specifies where to match within a searchable term: anywhere, at
    //     the beginning of the term, on word boundaries within the term, or a
    //     few other options.
    //   - We use the default value, MATCH_BOUNDARY, which matches on word
    //     boundaries within each searchable term.
    //   - See the MATCH_* constants in mozIPlacesAutoComplete.idl for more.
    const MATCH_BEHAVIOR = Ci.mozIPlacesAutoComplete.MATCH_BOUNDARY;

    // This constant corresponds to the :searchBehavior variable, also passed to
    // the AUTOCOMPLETE_MATCH function. Unlike matchBehavior, we construct this
    // value by adding up options, C-style (that is, via bitwise OR).
    //   - It specifies which fields to search out of history, bookmarks, tags,
    //     page titles, page URLs, typed pages, javascript: URLs, currently-open
    //     pages, and whether to include search suggestions.
    //   - It also specifies whether to use the union or intersection of places
    //     fields for the 'restrict' case (not sure, but seems like this is used
    //     to narrow searches where the input is an empty string).
    //   - See the BEHAVIOR_* constants in mozIPlacesAutoComplete.idl for more.
    //   - The behavior constants are bitwise OR-ed together; look at how
    //     store._defaultBehavior is constructed in UnifiedComplete.js.
    //     In particular, UnifiedComplete uses: HISTORY, BOOKMARK, OPENPAGE,
    //     and TYPED.
    //   - In our case, we want to search history, bookmarks, tags, page titles,
    //     page URLs, and typed pages, but not javascript URLs, currently-open
    //     pages (because, unlike the existing code, we don't track open tabs
    //     in a SQLite temp table--we use a simpler approach, see isOpen below),
    //     or search suggestions (because we separately query the search
    //     suggestion service). So, the correct value is constructed by taking
    //     the bitwise OR of those BEHAVIOR_* constants.
    const mp = Ci.mozIPlacesAutoComplete;
    const SEARCH_BEHAVIOR = mp.BEHAVIOR_HISTORY | mp.BEHAVIOR_BOOKMARK |
                            mp.BEHAVIOR_TAG | mp.BEHAVIOR_TITLE |
                            mp.BEHAVIOR_URL | mp.BEHAVIOR_TYPED;

    // This subquery can't be omitted: it yields several booleans that we have
    // to pass to the AUTOCOMPLETE_MATCH function, namely, 'bookmarked', 'tags',
    // and 'btitle'.
    const SQL_BOOKMARK_TAGS_FRAGMENT =
      `EXISTS(SELECT 1 FROM moz_bookmarks WHERE fk = h.id) AS bookmarked,
       ( SELECT title FROM moz_bookmarks WHERE fk = h.id AND title NOTNULL
         ORDER BY lastModified DESC LIMIT 1
       ) AS btitle,
       ( SELECT GROUP_CONCAT(t.title, ', ')
         FROM moz_bookmarks b
         JOIN moz_bookmarks t ON t.id = +b.parent AND t.parent = :parent
         WHERE b.fk = h.id
       ) AS tags`;

    // TODO: t.open_count isn't available, because we don't count open pages
    //       as part of our query (see discussion above), so we set it to zero
    //       in the AUTOCOMPLETE_MATCH call below. It's not clear yet how this
    //       change will impact results.
    const query =
      `SELECT ${QUERY_TYPE}, h.url, h.title, f.url, ${SQL_BOOKMARK_TAGS_FRAGMENT},
              h.visit_count, h.typed, h.id, h.frecency
       FROM moz_places h
       LEFT JOIN moz_favicons f ON f.id = h.favicon_id
       WHERE h.frecency <> 0
         AND AUTOCOMPLETE_MATCH(:searchString, h.url,
                                IFNULL(btitle, h.title), tags,
                                h.visit_count, h.typed,
                                bookmarked, /* t.open_count, */ 0,
                                ${MATCH_BEHAVIOR}, ${SEARCH_BEHAVIOR})
         ${conditions}
       ORDER BY h.frecency DESC, h.id DESC
       LIMIT :maxResults`;
    return query;
  },

  // Check whether a given URL is already an open tab.
  //
  // If anything goes wrong, return a falsy value.
  //
  // Note: we don't currently attempt to canonicalize the urls in any way, so we
  // might see false negatives due to variants like http vs https, www vs no www,
  // query strings, or hashes.
  isOpen: function(url) {
    const openUrls = [];
    let browserState;

    // Get a list of all open tabs from nsSessionStore, then look for the specified
    // url in the list.
    // If anything goes wrong with parsing the browser state JSON, just give up
    // and return a falsy value.
    try {
      browserState = JSON.parse(SessionStore.getBrowserState());
    } catch (ex) {} // eslint-disable-line

    if (!browserState) {
      return;
    }

    // Iterate over open windows, and open tabs in each window, and grab the
    // first URL in each tab entry. I assume other entries listings would
    // correspond to iframes or frames, neither of which we care about.
    browserState.windows.forEach((w) => {
      w.tabs.forEach((t) => {
        openUrls.push(t.entries[0].url);
      });
    });

    return openUrls.indexOf(url) > -1;
  },

  // Public search API
  //
  // This is a first naive implementation of a search function. Returns a
  // Promise that resolves to a list of results (or an empty list, if there
  // are no results).
  //
  // Given a search string, query Places for matching visits, sort by frecency.
  // Then convert into JSON objects ready for serialization, and resolve Task.
  //
  // TODO: Manage debouncing user input and canceling requests in flight (#144)
  search: Task.async(function* (searchString) {
    // TODO: Do we want to pool and reuse connections? This code grabs a new
    // connection with every keystroke (#146).
    const db = yield PlacesUtils.promiseDBConnection();

    const query = this.defaultQuery();
    const params = {
      searchString: searchString,
      maxResults: 20
    };

    const results = yield db.execute(query, params);

    const converted = yield this._processResults(results);

    // TODO: We put the search term inside each item only because it matches
    // the existing API. Would make much more sense to put this top level in
    // the final message packet (#145).
    converted.forEach((r) => { r.text = searchString; });

    return yield converted;
  }),

  _processResults: Task.async(function* (results) {
    const processed = [];
    for (let i = 0, item; i < results.length; i++) {
      item = yield this._processRow(results[i]);
      if (!this._isSearchResult(item)) {
        processed.push(item);
      } else {
        // only keeping this branch of the conditional for quality testing
        console.log('excluding a search result from the awesomebar: ', item.url);
      }
    }
    return yield processed;
  }),
  // Warning: This function is Gecko copypasta.
  // Taken from BookmarkHTMLUtils.jsm, hg revision 470f4f8c2b2d
  base64EncodeString: function(str) {
    const wrapped = String.fromCharCode.apply(String, str);
    const stream = Cc['@mozilla.org/io/string-input-stream;1']
                   .createInstance(Ci.nsIStringInputStream);
    stream.setData(wrapped, wrapped.length);
    const encoder = Cc['@mozilla.org/scriptablebase64encoder;1']
                    .createInstance(Ci.nsIScriptableBase64Encoder);
    return encoder.encodeToString(stream, wrapped.length);
  },
  // Search result pages pop up quite often in the SQL results, but they reduce
  // the quality of the experience. This function filters out those urls.
  //
  // l10n TODO: This filter function will need to be localized when we expand
  // beyond en-US.
  _isSearchResult: function(result) {
    // We exclude the scheme: some providers support both http and https.
    const searchResultsRegexes = [
      // Capture google.com/search and google.com/maps/search
      /google\.com(.*)\/search/,
      // Some google searches (not sure when/why) seem to take this form:
      /google\.com\/\?q/,
      // Google redirects users between results page and content page. Exclude
      // those URLs, too. This happens for google.com/url as well as
      // news.google.com/news/url.
      /google\.com(.*)\/url\?/,
      // Some image search result pages seem to have this form:
      /google\.com\/imgres\?/,

      // Match bing.com/search and bing.com/images/search, /videos/search, etc.
      /bing\.com(.*)\/search/,
      /search\.yahoo\.com/,

      // This is just a guess. Need to look more carefully at DDG's blog, etc
      /https:\/\/duckduckgo\.com\/\?q/,

      // Wikipedia searches that start in FF and return no hits seem to land
      // at this URL:
      /wikipedia\.org\/wiki\/Special\:Search\?/,
      // while Wikipedia searches that start in the wikipedia search bar, and
      // return no hits, seem to wind up here:
      /wikipedia\.org\/w\/index\.php\?search/,

      // Amazon results feel more like a destination than web search results.
      // But, let's try excluding them and see.
      // Same story for ebay and twitter results.
      /amazon\.com\/s\?/,
      /ebay\.com\/sch\//,
      /twitter\.com\/search\?/
    ];
    return searchResultsRegexes.some((r) => {
      return r.test(result.url);
    });
  },
  _processRow: Task.async(function* (row) {
    // Rows we are not including, because the front-end doesn't need them:
    //   queryType:  row.getResultByIndex(0), // see QUERY_TYPE docs above
    //   visitCount: row.getResultByIndex(7),
    //   id:         row.getResultByIndex(9), // moz_places URL id
    //   typed:      !!row.getResultByIndex(8), // was it typed by the user
    const result = {
      url:        row.getResultByIndex(1),
      title:      row.getResultByIndex(2),
      // 'image' is the favicon url; we separately send the favicon file
      // if it's found in the cache.
      image: row.getResultByIndex(3),
      frecency:   row.getResultByIndex(10)
    };

    // If the page is bookmarked, append a bookmark object to the result.
    result.bookmark = null;
    if (row.getResultByIndex(4)) {
      result.bookmark = {
        title: row.getResultByIndex(5),
        tags: row.getResultByIndex(6)
      };
    }

    // 'open' means: is it a currently-open window?
    // We can use this in place of the moz-action:'switchtotab' URLs that we
    // previously got from the Gecko autocomplete controller.
    result.open = this.isOpen(result.url);

    // 'type' is a legacy thing from the old autocomplete code, used for
    // styling results. Not sure if we should keep it forever, but for now,
    // keep a simplified version of the logic.
    result.type = result.open ? 'action' :
                    result.bookmark ? 'bookmark' : 'favicon';

    // If the favicon image is in the browser cache, append it in data URI
    // Base64-encoded form, ready to be set as the src of an img element.
    result.imageData = null;
    try {
      // `promiseFaviconData` rejects if no favicon data is found, and `yield`
      // converts it to an Error.
      const faviconData = yield PlacesUtils.promiseFaviconData(result.url);
      result.imageData = 'data:' + faviconData.mimeType + ';base64,' +
        this.base64EncodeString(faviconData.data);
    } catch (ex) {} // eslint-disable-line

    // include fancy metadata (description or nice image), if we have them
    let annos = PlacesUtils.getAnnotationsForURI(Services.io.newURI(result.url, null,null));
    annos.forEach((anno) => {
      if (anno.name === 'LOLZERS/imgDataUri') {
        result.fancyImageData = anno.value;
      } else if (anno.name === 'LOLZERS/description') {
        result.description = anno.value;
      }
    });

    return yield result;
  }),

  shutdown: function() {
    // TODO: tear down db connection, cancel anything in flight (#146)
  }
};
