// popup event handlers on the chrome side

'use strict';

/* global Cc, Ci, Cu, Components, SearchSuggestionController, Services,
   XPCOMUtils */

XPCOMUtils.defineLazyModuleGetter(this, 'SearchSuggestionController',
  'resource://gre/modules/SearchSuggestionController.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Promise',
  'resource://gre/modules/Promise.jsm');

function Popup() {
  const prefBranch = Cc['@mozilla.org/preferences-service;1']
                   .getService(Ci.nsIPrefService)
                   .getBranch('');
  this.frameURL = prefBranch.getPrefType('services.universalSearch.frameURL') ?
                    prefBranch.getCharPref('services.universalSearch.frameURL') :
                    'https://d1fnkpeapwua2i.cloudfront.net/index.html';

  // setting isPinned to true will force the popup to stay open forever
  this.isPinned = false;
}
Popup.prototype = {
  constructor: Popup,
  render: function(win) {
    const ns = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
    this.popup = win.document.createElementNS(ns, 'panel');
    this.popup.setAttribute('type', 'autocomplete-richlistbox');
    this.popup.setAttribute('id', 'PopupAutoCompleteRichResultUnivSearch');
    this.popup.setAttribute('noautofocus', 'true');

    const oldPopup = win.document.getElementById('PopupAutoCompleteRichResult');
    this.popupParent = oldPopup.parentElement;
    this.popupParent.appendChild(this.popup);

    // wait till the XBL binding is applied, then override this method
    this.popup._appendCurrentResult = this._appendCurrentResult.bind(this);

    // XXX For some bizarre reason I can't just use handleEvent to listen for
    //     the browser element's load event. So, falling back to .bind
    this.onBrowserLoaded = this.onBrowserLoaded.bind(this);

    this.popup.addEventListener('popuphiding', this);
    this.popup.addEventListener('popupshowing', this);

    window.US.broker.subscribe('iframe::autocomplete-url-clicked',
                               this.onAutocompleteURLClicked, this);

    // XXX: The browser element is an anonymous XUL element created by XBL at
    //      an unpredictable time in the startup flow. We have to wait for the
    //      XBL constructor to set a pointer to the element. After that, we can
    //      set the 'src' on the browser element to point at our iframe. Once
    //      the iframe page loads, we can initialize a WebChannel and start
    //      communication.
    this.waitForBrowser();
  },
  derender: function(win) {
    // remove the load listener, in case uninstall happens before onBrowserLoaded fires
    window.US.browser.removeEventListener('load', this.onBrowserLoaded, true);
    this.popupParent.removeChild(this.popup);

    this.popup.removeEventListener('popuphiding', this);
    this.popup.removeEventListener('popupshowing', this);

    delete window.US.browser;
    window.US.broker.unsubscribe('iframe::autocomplete-url-clicked',
                                 this.onAutocompleteURLClicked, this);
  },
  waitForBrowser: function() {
    if (this.browserInitialized) { return; }
    if ('browser' in window.US) {
      this.browserInitialized = true;
      // TODO: instead of waiting for load event, use an nsIWebProgressListener
      window.US.browser.addEventListener('load', this.onBrowserLoaded, true);
      window.US.browser.setAttribute('src', this.frameURL + '?cachebust=' + Date.now());
      return;
    }
    setTimeout(this.waitForBrowser.bind(this), 0);
  },
  // when the iframe is ready, load up the WebChannel by injecting the content.js script
  onBrowserLoaded: function() {
    console.log('Popup: onBrowserLoaded fired');
    window.US.browser.removeEventListener('load', this.onBrowserLoaded, true);
    window.US.browser.messageManager.loadFrameScript('chrome://browser/content/content.js', true);
  },
  handleEvent: function(evt) {
    const handlers = {
      'popuphiding': this.onPopupHiding,
      'popupshowing': this.onPopupShowing
    };
    if (evt.type in handlers) {
      handlers[evt.type].call(this, evt);
    } else {
      console.log('handleEvent fired for unknown event ' + evt.type);
    }
  },
  onAutocompleteURLClicked: function() {
    this.popup.hidePopup();
  },
  onPopupShowing: function() {
    window.US.broker.publish('popup::popupOpen');
  },
  onPopupHiding: function(evt) {
    if (this.isPinned) {
      return evt.preventDefault();
    }
    window.US.broker.publish('popup::popupClose');
  },
  _getImageURLForResolution: function(aWin, aURL, aWidth, aHeight) {
    if (!aURL.endsWith('.ico') && !aURL.endsWith('.ICO')) {
      return aURL;
    }
    const width = Math.round(aWidth * aWin.devicePixelRatio);
    const height = Math.round(aHeight * aWin.devicePixelRatio);
    return aURL + (aURL.contains('#') ? '&' : '#') +
           '-moz-resolution=' + width + ',' + height;
  },
  _appendCurrentResult: function() {
    const autocompleteResults = this._getAutocompleteSearchResults();
    // TODO: refactor
    this._getSearchSuggestions().then(function(searchSuggestions) {
      window.US.broker.publish('popup::autocompleteSearchResults', autocompleteResults);

      delete searchSuggestions.formHistoryResult;
      window.US.broker.publish('popup::suggestedSearchResults',
                               searchSuggestions);
    }, function(err) {
      Cu.reportError(err);
      window.US.broker.publish('popup::autocompleteSearchResults', autocompleteResults);
      window.US.broker.publish('popup::suggestedSearchResults', []);
    });
  },
  _getAutocompleteSearchResults: function() {
    const controller = this.popup.mInput.controller;
    const maxResults = 5;
    let results = [];

    // the controller's searchStatus is not a reliable way to decide when/what to send.
    // instead, we'll just check the number of results and act accordingly.
    if (controller.matchCount) {
      results = [];
      for (let i = 0; i < Math.min(maxResults, controller.matchCount); i++) {
        const chromeImgLink = this._getImageURLForResolution(window, controller.getImageAt(i), 16, 16);
        // if we have a favicon link, it'll be of the form "moz-anno:favicon:http://link/to/favicon"
        // else, it'll be a chrome:// link to the default favicon img
        const imgMatches = chromeImgLink.match(/^moz-anno\:favicon\:(.*)/);

        results.push({
          url: Components.classes['@mozilla.org/intl/texttosuburi;1'].
                getService(Components.interfaces.nsITextToSubURI).
                unEscapeURIForUI('UTF-8', controller.getValueAt(i)),
          image: imgMatches ? imgMatches[1] : null,
          title: controller.getCommentAt(i),
          type: controller.getStyleAt(i),
          text: controller.searchString.trim()
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
    const controller = this.popup.mInput.controller;

    // it seems like Services.search.isInitialized is always true?
    if (!Services.search.isInitialized) {
      return;
    }
    const MAX_LOCAL_SUGGESTIONS = 3;
    const MAX_SUGGESTIONS = 6;
    const REMOTE_TIMEOUT = 500; // same timeout as in SearchSuggestionController.jsm
    const isPrivateBrowsingSession = false; // we don't care about this right now

    // searchTerm is the same thing as the 'text' item sent down in each result.
    // maybe that's not a useful place to put the search term...
    const searchTerm = controller.searchString.trim();

    // unfortunately, the controller wants to do some UI twiddling.
    // and we don't have any UI to give it. so it barfs.
    const searchController = new SearchSuggestionController();
    const engine = Services.search.currentEngine;
    const ok = SearchSuggestionController.engineOffersSuggestions(engine);

    searchController.maxLocalResults = ok ? MAX_LOCAL_SUGGESTIONS : MAX_SUGGESTIONS;
    searchController.maxRemoteResults = ok ? MAX_SUGGESTIONS : 0;
    searchController.remoteTimeout = REMOTE_TIMEOUT;

    const suggestions = searchController.fetch(searchTerm, isPrivateBrowsingSession, engine);
    // returns a promise for the formatted results of the search suggestion engine
    return suggestions;
  }
};
