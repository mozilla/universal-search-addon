// popup event handlers on the chrome side

'use strict';

/* global Components, PrivateBrowsingUtils, SearchSuggestionController,
          Services, XPCOMUtils */

const {utils: Cu, interfaces: Ci, classes: Cc} = Components;

const EXPORTED_SYMBOLS = ['Popup']; // eslint-disable-line no-unused-vars

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'PrivateBrowsingUtils',
  'resource://gre/modules/PrivateBrowsingUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'SearchSuggestionController',
  'resource://gre/modules/SearchSuggestionController.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'console',
  'resource://gre/modules/devtools/Console.jsm');

// module globals
let win;
let app;

function Popup(window, appGlobal) {
  win = window;
  app = appGlobal;

  const prefBranch = Cc['@mozilla.org/preferences-service;1']
                   .getService(Ci.nsIPrefService)
                   .getBranch('');
  this.frameURL = prefBranch.getPrefType('services.universalSearch.frameURL') ?
                    prefBranch.getCharPref('services.universalSearch.frameURL') :
                    'https://d1fnkpeapwua2i.cloudfront.net/index.html';

  // setting isPinned to true will force the popup to stay open forever
  this.isPinned = false;

  this.inPrivateContext = PrivateBrowsingUtils.isWindowPrivate(win);
}
Popup.prototype = {
  constructor: Popup,
  render: function() {
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

    app.broker.subscribe('iframe::autocomplete-url-clicked',
                               this.onAutocompleteURLClicked, this);

    // XXX: The browser element is an anonymous XUL element created by XBL at
    //      an unpredictable time in the startup flow. We have to wait for the
    //      XBL constructor to set a pointer to the element. After that, we can
    //      set the 'src' on the browser element to point at our iframe. Once
    //      the iframe page loads, we can initialize a WebChannel and start
    //      communication.
    this.waitForBrowser();
  },
  remove: function() {
    // remove the load listener, in case uninstall happens before onBrowserLoaded fires
    app.browser.removeEventListener('load', this.onBrowserLoaded, true);
    this.popupParent.removeChild(this.popup);

    this.popup.removeEventListener('popuphiding', this);
    this.popup.removeEventListener('popupshowing', this);

    delete app.browser;
    app.broker.unsubscribe('iframe::autocomplete-url-clicked',
                                 this.onAutocompleteURLClicked, this);
  },
  waitForBrowser: function() {
    if (this.browserInitialized) { return; }
    if ('browser' in app) {
      this.browserInitialized = true;
      // TODO: instead of waiting for load event, use an nsIWebProgressListener
      app.browser.addEventListener('load', this.onBrowserLoaded, true);
      app.browser.setAttribute('src', this.frameURL + '?cachebust=' + Date.now());
      return;
    }
    win.setTimeout(() => this.waitForBrowser(), 0);
  },
  // when the iframe is ready, load up the WebChannel by injecting the content.js script
  onBrowserLoaded: function() {
    console.log('Popup: onBrowserLoaded fired');
    app.browser.removeEventListener('load', this.onBrowserLoaded, true);
    app.browser.messageManager.loadFrameScript('chrome://browser/content/content.js', true);
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
    app.broker.publish('popup::popupOpen');
  },
  onPopupHiding: function(evt) {
    if (this.isPinned) {
      return evt.preventDefault();
    }
    app.broker.publish('popup::popupClose');
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
  // TODO: use UnifiedComplete instead of calling these services separately (#114)
  _appendCurrentResult: function() {
    const autocompleteResults = this._getAutocompleteSearchResults();
    if (this.inPrivateContext) {
      app.broker.publish('popup::autocompleteSearchResults', autocompleteResults);
      app.broker.publish('popup::suggestedSearchResults', []);
    } else {
      this._getSearchSuggestions().then(function(searchSuggestions) {
        app.broker.publish('popup::autocompleteSearchResults', autocompleteResults);

        delete searchSuggestions.formHistoryResult;
        app.broker.publish('popup::suggestedSearchResults',
                                 searchSuggestions);
      }, function(err) {
        Cu.reportError(err);
        app.broker.publish('popup::autocompleteSearchResults', autocompleteResults);
        app.broker.publish('popup::suggestedSearchResults', []);
      });
    }
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
        const chromeImgLink = this._getImageURLForResolution(win, controller.getImageAt(i), 16, 16);
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
    const controller = this.popup.mInput.controller;

    // it seems like Services.search.isInitialized is always true?
    if (!Services.search.isInitialized) {
      return;
    }
    const MAX_LOCAL_SUGGESTIONS = 3;
    const MAX_SUGGESTIONS = 6;
    const REMOTE_TIMEOUT = 500; // same timeout as in SearchSuggestionController.jsm

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

    const suggestions = searchController.fetch(searchTerm, this.inPrivateContext, engine);
    // returns a promise for the formatted results of the search suggestion engine
    return suggestions;
  }
};
