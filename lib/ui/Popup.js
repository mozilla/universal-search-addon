// popup event handlers on the chrome side

'use strict';

XPCOMUtils.defineLazyModuleGetter(this, 'SearchSuggestionController',
  'resource://gre/modules/SearchSuggestionController.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Promise',
  'resource://gre/modules/Promise.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'WebChannel',
  'resource://gre/modules/WebChannel.jsm');

var EXPORTED_SYMBOLS = [ 'Popup' ];

function Popup() {
  var prefBranch = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch("");
  this.channelID = 'ohai';
  this.frameURL = prefBranch.getPrefType('services.universalSearch.frameURL') ?
                   prefBranch.getCharPref('services.universalSearch.frameURL') :
                   'https://d1fnkpeapwua2i.cloudfront.net/index.html';
  this.frameBaseURL = prefBranch.getPrefType('services.universalSearch.baseURL') ?
                       prefBranch.getCharPref('services.universalSearch.baseURL') :
                       'https://d1fnkpeapwua2i.cloudfront.net';
};
Popup.prototype = {
  constructor: Popup,
  port: null,
  browser: null,
  // setting isPinned to true will force the popup to stay open forever
  isPinned: false,
  render:  function(win) {
    this.popup = win.document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'panel');
    this.popup.setAttribute('type', 'autocomplete-richlistbox');
    this.popup.setAttribute('id', 'PopupAutoCompleteRichResultUnivSearch');
    this.popup.setAttribute('noautofocus', 'true');
    this.popup.setAttribute('ignorekeys', 'false');
    this.popup.setAttribute('consumeoutsideclicks', 'false');

    this.popupParent = win.document.getElementById('PopupAutoCompleteRichResult').parentElement;
    this.popupParent.appendChild(this.popup);

    // wait till the XBL binding is applied, then override these methods
    this.popup._appendCurrentResult = this._appendCurrentResult.bind(this);

    this.popup.addEventListener('popuphiding', this.onPopupHiding.bind(this));
    this.popup.addEventListener('popupshowing', this.onPopupShowing.bind(this));

    // XXX: We aren't really initialized yet. We wait to set up the WebChannel
    //      until the browser element loads. It's an anonymous XUL node, so we
    //      wait until our XBL constructor is called, and it passes us the node.

    // oh binding is fun
    this.onBrowserLoaded = this.onBrowserLoaded.bind(this);
  },
  derender: function(win) {
    if (this.port) {
      this.port.stopListening();
    }
    // remove the load listener, in case uninstall happens before onBrowserLoaded fires
    this.browser.removeEventListener('load', this.onBrowserLoaded, true);
    this.popupParent.removeChild(this.popup);
  },
  // Set the iframe src and wire up ready listener that will attach the WebChannel.
  // Invoked by the XBL constructor, which passes in the anonymous browser element.
  //
  // TODO: I don't understand the logic behind when XBL constructors fire, so this
  // might run repeatedly on the same window, causing WebChannels, etc, to be leaked.
  setBrowser: function(browserEl) {
    if (this.rendered) { return; }
    this.browser = browserEl;
    this.browser.addEventListener('load', this.onBrowserLoaded, true);
    this.browser.setAttribute('src', this.frameURL + '?cachebust=' + Date.now());
  },
  // when the iframe is ready, load up the WebChannel
  onBrowserLoaded: function() {
    this.browser.removeEventListener('load', this.onBrowserLoaded, true);
    this.browser.messageManager.loadFrameScript('chrome://browser/content/content.js', true);

    this.port = new WebChannel(this.channelID, Services.io.newURI(this.frameBaseURL, null, null));
    this.port.listen(this.onMessage.bind(this));
  },
  onMessage: function(id, msg, sender) {
    var engine = Services.search.defaultEngine;
    var url;
    if (id != this.channelID) { return; }
    if (msg.type == 'autocomplete-url-clicked') {
      console.log('browser received "autocomplete-url-clicked" event: ', msg);
      this.popup.hidePopup();
      if (msg.data.resultType == 'url') {
        // it's navigable, go for it
        window.US.gURLBar.inputField.value = msg.data.result;
        window.gBrowser.loadURI(msg.data.result);
      } else {
        // it's a search suggestion, so:
        // grab the search service, get the URL, navigate to _that_
        url = engine.getSubmission(msg.data.result).uri.spec;
        window.US.gURLBar.inputField.value = url;
        window.gBrowser.loadURI(url);
      }
    } else if (msg.type == 'url-selected') {
      console.log('browser received "url-selected" event: ', msg);
      if (msg.data.resultType == 'url') {
        window.US.gURLBar.value = msg.data.result;
        window.US.gURLBar._search = null;
      } else {
        // show the search term in the address bar,
        // but if the user hits 'enter', navigate to the search result page.
        // we may not always null out _search in time, so we will check if
        // the search term in the gURLBar.value matches gURLBar._search.term
        // before we navigate to the gURLBar._search.url.
        window.US.gURLBar.value = msg.data.result;
        url = engine.getSubmission(msg.data.result).uri.spec;
        window.US.gURLBar._search = { term: msg.data.result, url: url };
      }
    } else {
      console.log('browser received unrecognized event: ', msg);
    }
  },
  onPopupShowing: function() {
    if (!this.port) { return; }
    var msg = { type: 'popupopen' };
    console.log('browser sending message to iframe: ', msg);
    this.port.send(msg, {
      browser: this.browser,
      principal: Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal)
    });
  },
  onPopupHiding: function(evt) {
    if (this.isPinned) { evt.preventDefault(); }
    if (!this.port) { return; }
    var msg = { type: 'popupclose' };
    console.log('browser sending message to iframe: ', msg);
    this.port.send(msg, {
      browser: this.browser,
      principal: Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal)
    });
  },
  _getImageURLForResolution: function(aWin, aURL, aWidth, aHeight) {
    if (!aURL.endsWith('.ico') && !aURL.endsWith('.ICO')) {
      return aURL;
    }
    let width  = Math.round(aWidth * aWin.devicePixelRatio);
    let height = Math.round(aHeight * aWin.devicePixelRatio);
    return aURL + (aURL.contains("#") ? "&" : "#") +
           "-moz-resolution=" + width + "," + height;

  },
  _appendCurrentResult: function() {
    var autocompleteResults = this._getAutocompleteSearchResults();
    var autocompleteMsg = {
      type: 'autocomplete-search-results',
      data: autocompleteResults
    };
    var suggestedMsg = {
      type: 'suggested-search-results',
      data: {
        results: []
      }
    };
    // TODO: refactor
    this._getSearchSuggestions().then(function(searchSuggestions) {
      console.log('browser sending message to iframe: ', autocompleteMsg);
      this.port.send(autocompleteMsg, {
        browser: this.browser,
        principal: Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal)
      });

      delete searchSuggestions.formHistoryResult;
      suggestedMsg.data.results = searchSuggestions;
      console.log('browser sending message to iframe: ', suggestedMsg);
      this.port.send(suggestedMsg, {
        browser: this.browser,
        principal: Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal)
      });
    }.bind(this), function(err) {
      Cu.reportError(err);
      console.log('browser sending message to iframe: ', autocompleteMsg);
      this.port.send(autocompleteMsg, {
        browser: this.browser,
        principal: Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal)
      });
      console.log('browser sending message to iframe: ', suggestedMsg);
      this.port.send(suggestedMsg, {
        browser: this.browser,
        principal: Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal)
      });
    });
  },
  _getAutocompleteSearchResults: function() {
    var controller = this.popup.mInput.controller;
    var maxResults = 5;
    var results = [];

    // the controller's searchStatus is not a reliable way to decide when/what to send.
    // instead, we'll just check the number of results and act accordingly.
    if (controller.matchCount) {
      results = [];
      for (var i = 0; i < Math.min(maxResults, controller.matchCount); i++) {
        var chromeImgLink = this._getImageURLForResolution(window, controller.getImageAt(i), 16, 16);
        // if we have a favicon link, it'll be of the form "moz-anno:favicon:http://link/to/favicon"
        // else, it'll be a chrome:// link to the default favicon img
        var imgMatches = chromeImgLink.match(/^moz-anno\:favicon\:(.*)/);

        results.push({
          url: Components.classes["@mozilla.org/intl/texttosuburi;1"].
                getService(Components.interfaces.nsITextToSubURI).
                unEscapeURIForUI("UTF-8", controller.getValueAt(i)),
          image: imgMatches ? imgMatches[1] : null,
          title: controller.getCommentAt(i),
          type: controller.getStyleAt(i),
          text: controller.searchString.replace(/^\s+/, "").replace(/\s+$/, "")
        });
      }
    }
    return results;
  },
  _getSearchSuggestions: function() {
    //
    // now, we also want to include the search suggestions in the output, via some separate signal.
    // a lot of this code lifted from browser/modules/AboutHome.jsm and browser/modules/ContentSearch.jsm
    // ( face-with-open-mouth-and-cold-sweat-emoji ), heh
    //
    // TODO: maybe just send signals to ContentSearch instead, the problem there is that I couldn't
    // figure out which message manager to pass into ContentSearch, in order to get the response message back.
    // it's possible all of this code was unnecessary and we could just fire a GetSuggestions message into
    // the ether, and fully expect to get a Suggestions object back with the suggestions. /me shrugs
    // 
    //var suggestionData = { engineName: engine.name, searchString: gURLBar.inputField.value, remoteTimeout: 5000 };
    //ContentSearch._onMessageGetSuggestions(brow.messageManager, suggestionData);
    var controller = this.popup.mInput.controller;

    // it seems like Services.search.isInitialized is always true?
    if (!Services.search.isInitialized) {
      return;
    }
    let MAX_LOCAL_SUGGESTIONS = 3;
    let MAX_SUGGESTIONS = 6;
    let REMOTE_TIMEOUT = 500; // same timeout as in SearchSuggestionController.jsm
    let isPrivateBrowsingSession = false; // we don't care about this right now

    // searchTerm is the same thing as the 'text' item sent down in each result.
    // maybe that's not a useful place to put the search term...
    let searchTerm = controller.searchString.replace(/^\s+/, "").replace(/\s+$/, "")

    // unfortunately, the controller wants to do some UI twiddling.
    // and we don't have any UI to give it. so it barfs.
    let searchController = new SearchSuggestionController();
    let engine = Services.search.currentEngine;
    let ok = SearchSuggestionController.engineOffersSuggestions(engine);

    searchController.maxLocalResults = ok ? MAX_LOCAL_SUGGESTIONS : MAX_SUGGESTIONS;
    searchController.maxRemoteResults = ok ? MAX_SUGGESTIONS : 0;
    searchController.remoteTimeout = REMOTE_TIMEOUT;

    let suggestions = searchController.fetch(searchTerm, isPrivateBrowsingSession, engine);
    // returns a promise for the formatted results of the search suggestion engine
    return suggestions;
  }
};
