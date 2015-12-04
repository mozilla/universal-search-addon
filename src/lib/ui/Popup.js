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

    // Once the popup is in the XUL DOM, we want to set its height to a default.
    // For now, using 303px, the number we've historically set via CSS. We
    // could easily set this default via a pref, too.
    this.popup.sizeTo(this.popup.width, 303);

    // XXX For some bizarre reason I can't just use handleEvent to listen for
    //     the browser element's load event. So, falling back to .bind
    this.onBrowserLoaded = this.onBrowserLoaded.bind(this);

    this.popup.addEventListener('popuphiding', this);
    this.popup.addEventListener('popupshowing', this);

    this.app.broker.subscribe('iframe::autocomplete-url-clicked',
                               this.onAutocompleteURLClicked, this);
    this.app.broker.subscribe('iframe::adjust-height',
                               this.onAdjustHeight, this);
    this.app.broker.subscribe('urlbar::printableKey',
                               this.onPrintableKey, this);

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
  onAdjustHeight: function(data) {
    if (!data || !data.height) {
      throw new Error('Popup: onAdjustHeight failed: no height specified');
    }
    const newHeight = parseInt(data.height, 10);
    if (!isFinite(newHeight)) {
      throw new Error('Popup: onAdjustHeight failed: invalid height specified');
    }

    this.popup.sizeTo(this.popup.width, newHeight);

    // Wait a turn, then confirm the new height by checking the XUL DOM.
    this.win.setTimeout(() => {
      this.sendPopupHeight();
    }, 0);
  },
  onPopupShowing: function() {
    this.app.broker.publish('popup::popupOpen');
    this.sendPopupHeight();
  },
  sendPopupHeight: function() {
    this.app.broker.publish('popup::popupHeight', {
      height: this.popup.height
    });
  },
  onPopupHiding: function(evt) {
    if (this.isPinned) {
      return evt.preventDefault();
    }
    this.app.broker.publish('popup::popupClose');
  },
  onPrintableKey: function(data) {
    const searchTerm = data.query;

    Promise.all([
      this._getPlacesSuggestions(searchTerm),
      this._getSearchSuggestions(searchTerm)
    ]).then((results) => {
      const placesResults = results[0];
      const searchSuggestions = results[1];
      this.app.broker.publish('popup::autocompleteSearchResults', placesResults);
      if (searchSuggestions) {
        delete searchSuggestions.formHistoryResult;
      }
      this.app.broker.publish('popup::suggestedSearchResults', searchSuggestions);
    }, (err) => {
      Cu.reportError(err);
    });
  },
  _getPlacesSuggestions: Task.async(function* (searchTerm) {
    return yield this.app.placesSearch.search(searchTerm);
  }),
  _getSearchSuggestions: Task.async(function* (searchTerm) {
    // Search-related constants; see SearchSuggestionController.jsm for more.
    const MAX_LOCAL_SUGGESTIONS = 3;
    const MAX_SUGGESTIONS = 6;
    const REMOTE_TIMEOUT = 500;

    // If we need to bail early for any reason, return an empty object that
    // fits the API format.
    let suggestions = {
      term: searchTerm,
      local: [],
      remote: []
    };

    // Quit immediately if we're in a private window.
    if (this.inPrivateContext) {
      return yield suggestions;
    }

    const searchController = new SearchSuggestionController();
    const engine = Services.search.currentEngine;
    const ok = SearchSuggestionController.engineOffersSuggestions(engine);

    searchController.maxLocalResults = ok ? MAX_LOCAL_SUGGESTIONS : MAX_SUGGESTIONS;
    searchController.maxRemoteResults = ok ? MAX_SUGGESTIONS : 0;
    searchController.remoteTimeout = REMOTE_TIMEOUT;

    // Sometimes the search suggestion service will stubbornly return 403s,
    // perhaps mistaking the user for a bot? Or due to FF profile corruption?
    // Regardless of the source, since we're using Promise.all, we need to
    // avoid rejecting due to routine suggestion provider errors: otherwise, we
    // will also reject the places results. So, just return an empty result if
    // something goes wrong.
    try {
      suggestions = yield searchController.fetch(searchTerm, this.inPrivateContext, engine);
    } catch (ex) {
      Cu.reportError(ex);
    }

    return yield suggestions;
  })
};
