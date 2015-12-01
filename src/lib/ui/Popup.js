// popup event handlers on the chrome side

'use strict';

/* global Components, PrivateBrowsingUtils, SearchSuggestionController,
          Services, Task, XPCOMUtils */

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
XPCOMUtils.defineLazyModuleGetter(this, 'Task',
  'resource://gre/modules/Task.jsm');

function Popup(window, appGlobal) {
  this.win = window;
  this.app = appGlobal;

  const prefBranch = Cc['@mozilla.org/preferences-service;1']
                   .getService(Ci.nsIPrefService)
                   .getBranch('');
  this.frameURL = prefBranch.getPrefType('services.universalSearch.frameURL') ?
                    prefBranch.getCharPref('services.universalSearch.frameURL') :
                    'https://d1fnkpeapwua2i.cloudfront.net/index.html';

  // setting isPinned to true will force the popup to stay open forever
  this.isPinned = false;

  this.inPrivateContext = PrivateBrowsingUtils.isWindowPrivate(this.win);
}
Popup.prototype = {
  constructor: Popup,
  render: function() {
    const ns = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
    this.popup = this.win.document.createElementNS(ns, 'panel');
    this.popup.setAttribute('type', 'autocomplete-richlistbox');
    this.popup.setAttribute('id', 'PopupAutoCompleteRichResultUnivSearch');
    this.popup.setAttribute('noautofocus', 'true');

    const oldPopup = this.win.document.getElementById('PopupAutoCompleteRichResult');
    this.popupParent = oldPopup.parentElement;
    this.popupParent.appendChild(this.popup);

    // XXX Wait till the XBL binding is applied, then override _appendCurrentResult.
    //     This actually means we replace an XBL-defined method with one
    //     defined in JS, which has some funny consequences. In particular,
    //     XBL seems to invoke callbacks with the xpcshell BackstagePass object
    //     as the global context, which is madness; .bind() restores sanity.
    this._appendCurrentResult = Popup.prototype._appendCurrentResult.bind(this);
    this.popup._appendCurrentResult = this._appendCurrentResult;

    // XXX For some bizarre reason I can't just use handleEvent to listen for
    //     the browser element's load event. So, falling back to .bind
    this.onBrowserLoaded = this.onBrowserLoaded.bind(this);

    this.popup.addEventListener('popuphiding', this);
    this.popup.addEventListener('popupshowing', this);

    this.app.broker.subscribe('iframe::autocomplete-url-clicked',
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
    this.app.browser.removeEventListener('load', this.onBrowserLoaded, true);
    this.popupParent.removeChild(this.popup);

    this.popup.removeEventListener('popuphiding', this);
    this.popup.removeEventListener('popupshowing', this);

    delete this.app.browser;
    this.app.broker.unsubscribe('iframe::autocomplete-url-clicked',
                                 this.onAutocompleteURLClicked, this);
  },
  waitForBrowser: function() {
    if (this.browserInitialized) { return; }
    if ('browser' in this.app) {
      this.browserInitialized = true;
      // TODO: instead of waiting for load event, use an nsIWebProgressListener
      this.app.browser.addEventListener('load', this.onBrowserLoaded, true);
      this.app.browser.setAttribute('src', this.frameURL + '?cachebust=' + Date.now());
      return;
    }
    this.win.setTimeout(() => this.waitForBrowser(), 0);
  },
  // when the iframe is ready, load up the WebChannel by injecting the content.js script
  onBrowserLoaded: function() {
    console.log('Popup: onBrowserLoaded fired');
    this.app.browser.removeEventListener('load', this.onBrowserLoaded, true);
    this.app.browser.messageManager.loadFrameScript('chrome://browser/content/content.js', true);
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
    this.app.broker.publish('popup::popupOpen');
  },
  onPopupHiding: function(evt) {
    if (this.isPinned) {
      return evt.preventDefault();
    }
    this.app.broker.publish('popup::popupClose');
  },
  _appendCurrentResult: function() {
    this._getPlacesSuggestions().then((placesResults) => {
      if (this.inPrivateContext) {
        this.app.broker.publish('popup::autocompleteSearchResults', placesResults);
        this.app.broker.publish('popup::suggestedSearchResults', []);
      } else {
        this._getSearchSuggestions().then((searchSuggestions) => {
          this.app.broker.publish('popup::autocompleteSearchResults', placesResults);
          delete searchSuggestions.formHistoryResult;
          this.app.broker.publish('popup::suggestedSearchResults', searchSuggestions);
        }, (err) => {
          Cu.reportError(err);
          this.app.broker.publish('popup::autocompleteSearchResults', placesResults);
          this.app.broker.publish('popup::suggestedSearchResults', []);
        });
      }
    });
  },
  _getPlacesSuggestions: Task.async(function* () {
    const searchTerm = this.app.gBrowser.userTypedValue;
    return yield this.app.placesSearch.search(searchTerm);
  }),
  _getSearchSuggestions: Task.async(function* () {
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
    return yield suggestions;
  })
};
