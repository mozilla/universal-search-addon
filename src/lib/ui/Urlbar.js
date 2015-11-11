// urlbar listeners and event handlers

'use strict';

/* global Components, PrivateBrowsingUtils, Services, XPCOMUtils */

const {utils: Cu} = Components;

const EXPORTED_SYMBOLS = ['Urlbar']; // eslint-disable-line no-unused-vars

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'PrivateBrowsingUtils',
  'resource://gre/modules/PrivateBrowsingUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'console',
  'resource://gre/modules/devtools/Console.jsm');

function Urlbar(window, appGlobal) {
  this.win = window;
  this.app = appGlobal;
  this.urlbarUpdateTimer = null;
  this.urlbarNavigateTimer = null;
  // replaced handlers and elements
  this.replaced = {};
}
Urlbar.prototype = {
  constructor: Urlbar,
  render: function() {
    this.urlbar = this.win.document.getElementById('urlbar');

    this.replaced._autocompletepopup = this.urlbar.getAttribute('autocompletepopup');
    this.urlbar.setAttribute('autocompletepopup', 'PopupAutoCompleteRichResultUnivSearch');

    // in FF versions less than 43, unified complete has not landed, and the
    // popup will attempt to auto-close itself if we have zero results from
    // bookmarks/history for a given input string. We want to prevent the
    // popup from closing in exactly and only this instance.
    if (!this.app.hasUnifiedComplete) {
      const oldMin = this.urlbar.popup.input.minResultsForPopup;
      this.urlbar.popup.input._minResultsForPopup = oldMin;
      this.urlbar.popup.input.minResultsForPopup = 0;
    }

    // TODO: either do something with these events, or remove them
    this.urlbar.addEventListener('focus', this);
    this.urlbar.addEventListener('blur', this);
    this.urlbar.addEventListener('keydown', this);
    this.urlbar.addEventListener('keypress', this);
    this.urlbar.addEventListener('mousedown', this);
    this.urlbar.addEventListener('paste', this);
    this.urlbar.addEventListener('drop', this);

    // Popping the urlbar element out of the DOM and back in seems to reset
    // the XBL bindings, so that our binding is applied. :-P
    this.urlbar.parentNode.insertBefore(this.urlbar, this.urlbar.nextSibling);

    this.app.broker.subscribe('iframe::autocomplete-url-clicked',
                               this.onAutocompleteURLClicked, this);
    this.app.broker.subscribe('iframe::url-selected', this.onURLSelected, this);
    this.app.broker.subscribe('popup::popupOpen', this.onPopupOpen, this);
  },
  remove: function() {
    // restore the original minResults setting, if it was changed
    if (!this.app.hasUnifiedComplete) {
      const oldMin = this.urlbar.popup.input._minResultsForPopup;
      this.urlbar.popup.input.minResultsForPopup = oldMin;
    }

    // reconnect original popup to the urlbar
    this.urlbar.setAttribute('autocompletepopup', this.replaced._autocompletepopup);

    this.urlbar.removeEventListener('focus', this);
    this.urlbar.removeEventListener('blur', this);
    this.urlbar.removeEventListener('keydown', this);
    this.urlbar.removeEventListener('keypress', this);
    this.urlbar.removeEventListener('mousedown', this);
    this.urlbar.removeEventListener('paste', this);
    this.urlbar.removeEventListener('drop', this);

    // again, refresh the urlbar to update XBL bindings
    this.urlbar.parentNode.insertBefore(this.urlbar, this.urlbar.nextSibling);

    this.app.broker.unsubscribe('iframe::autocomplete-url-clicked',
                                 this.onAutocompleteURLClicked, this);
    this.app.broker.unsubscribe('iframe::url-selected', this.onURLSelected, this);
    this.app.broker.unsubscribe('popup::popupOpen', this.onPopupOpen, this);
  },
  onAutocompleteURLClicked: function(data) {
    if (data.resultType === 'url') {
      // it's navigable, go for it
      this.navigate(data.result);
    } else {
      // it's a search suggestion, so:
      // grab the search service, get the URL, navigate to _that_,
      // but show the search term in the urlbar
      const url = this._getSearchURLForTerm(data.result);
      this.navigate(url, data.result);
    }
  },
  // helper function that actually updates the urlbar
  _setUrlbarValue: function(url, searchTerm) {
    // gURLBar.inputField.value is the visible contents of the urlbar.
    // gURLBar.value is a separate hidden value.
    // Setting gURLBar.value also sets gURLBar.inputField.value, but not
    // vice versa.
    // So, if searchTerm is set, we want to first set the url, then replace
    // the visible input contents with the search string. If searchTerm
    // is not set, the urlbar will already show the url, so we don't need
    // to set it twice.
    // Note: this approach does work with the gURLBar.valueIsTyped logic,
    // which is convoluted but involves saving the last typed string, such
    // that, if the user has the popup open, then hits the Escape key twice,
    // the last typed value (or the last navigated value?) is shown.
    this.app.gURLBar.value = url;
    if (searchTerm) {
      this.app.gURLBar.inputField.value = searchTerm;
    }
  },
  updateUrlbar: function(url, searchTerm) {
    this.win.clearTimeout(this.urlbarUpdateTimer);
    this.urlbarUpdateTimer = this.win.setTimeout(() => {
      this._setUrlbarValue(url, searchTerm);
    }, 0);
  },
  _getSearchURLForTerm: function(searchTerm) {
    const engine = Services.search.defaultEngine;
    const url = engine.getSubmission(searchTerm).uri.spec;
    return url;
  },
  // If the user is navigating to a search, show the searchTerm, but surf to
  // the url. Otherwise, show the url and navigate to it. Because navigational
  // keys also set an update timer to show the selected item in the urlbar,
  // clear that timer, if it's set.
  navigate: function(url, searchTerm) {
    this.win.clearTimeout(this.urlbarUpdateTimer);
    this.urlbarUpdateTimer = null;

    this.win.clearTimeout(this.urlbarNavigateTimer);
    this.urlbarNavigateTimer = this.win.setTimeout(() => {
      this._setUrlbarValue(url, searchTerm);
      this.app.gURLBar.handleCommand(url);
    }, 0);
  },
  onURLSelected: function(data) {
    console.log('onURLSelected');
    if (this.urlbarNavigateTimer) {
      return;
    }
    if (data.resultType === 'url') {
      // The user selected a URL.
      this.updateUrlbar(data.result);
    } else if (data.resultType === 'empty') {
      // An Enter was pressed with the popup open, but nothing was selected, so
      // navigate to whatever's in the urlbar.
      // Set a dummy timer to avoid later nav-keys preventing the navigation.
      this.urlbarNavigateTimer = this.win.setTimeout(() => {});
      this.app.gURLBar.handleCommand();
    } else {
      // The user selected a search suggestion.
      // Set a timeout to show the search term in the address bar,
      // which cancels any updates queued up that haven't rendered yet.
      // if the user hits 'enter', we'll navigate to the search result page.
      const url = this._getSearchURLForTerm(data.result);
      this.updateUrlbar(url, data.result);
    }
  },
  handleEvent: function(evt) {
    const handlers = {
      'focus': this.onFocus,
      'blur': this.onBlur,
      'keydown': this.onKeyDown,
      'keypress': this.onKeyPress,
      'mousedown': this.onMouseDown,
      'paste': this.onPaste,
      'drop': this.onDrop
    };
    if (evt.type in handlers) {
      handlers[evt.type].call(this, evt);
    } else {
      console.log('handleEvent fired for unknown event ' + evt.type);
    }
  },
  _delayedCloseIfEmpty: function() {
    // debounce multiple Backspace events
    if (this._delayedCloseTimer) {
      return;
    }
    this._delayedCloseTimer = this.win.setTimeout(() => {
      this._delayedCloseTimer = null;
      if (!this.app.gURLBar.value) {
        this.app.popup.popup.closePopup();
      }
    }, 0);
  },
  _escKeys: ['ArrowLeft', 'ArrowRight', 'Escape'],
  _navKeys: ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Tab'],
  _sendNavigationalKey: function(evt) {
    const data = {
      key: evt.key,
      shiftKey: evt.shiftKey
    };
    this.app.broker.publish('urlbar::navigationalKey', data);
  },
  _sendPrintableKey: function() {
    // Wait a turn to reliably get the updated urlbar contents.
    this.win.setTimeout(() => {
      const data = {
        query: this.app.gBrowser.userTypedValue
      };
      this.app.broker.publish('urlbar::printableKey', data);
    });
  },
  onKeyDown: function(evt) {
    if (evt.key === 'Backspace') {
      // Backspace only closes the popup if the urlbar has been emptied out.
      // We don't know if the urlbar has handled the backspace yet, so wait
      // a turn, and if the urlbar's indeed empty, close the popup.
      this._delayedCloseIfEmpty();

      // If the user deleted in the middle of a string, we might want to send
      // the updated urlbar contents to the iframe. If the iframe closes while
      // we're fetching the updated string, that's fine.
      this._sendPrintableKey();
    } else if (this._escKeys.indexOf(evt.key) > -1) {
      // ArrowLeft, ArrowRight, and Escape all cause the popup to close.
      this.app.popup.popup.closePopup();
    } else if (evt.key === 'Enter') {
      // Only handle the Enter key if the popup is open or about to open
      if (this.app.popup.popup.state === 'open' || this.app.popup.popup.state === 'showing') {
        evt.preventDefault();
        this._sendNavigationalKey(evt);
      } else {
        // For unknown reasons, we can't just ignore the Enter key if the
        // popup is closed: the Enter key won't do anything :-\
        // For instance: user types a string, hits left arrow to hide the
        // popup, then hits enter.
        // Hacky workaround: explicitly ask the gURLBar to handle it.
        this.app.gURLBar.handleCommand();
      }
    } else if (this._navKeys.indexOf(evt.key) > -1) {
      // For other navigational keys, notify the iframe that the keyboard focus
      // needs to be adjusted.
      this._sendNavigationalKey(evt);
    } else if (evt.key.length === 1
               && !PrivateBrowsingUtils.isWindowPrivate(this.win)) {
      // Send printable, non-navigational keys to the iframe.
      // TODO: I'm not sure of the best way to ensure we have a printable key,
      // filed as issue #118. Our en-US centric hack: if the evt.key value is
      // longer than one char, it must be something weird, like 'Shift',
      // 'Equals', 'F1', 'Unidentified', and so on (le sigh).
      // If modifier keys are pressed, it's probably some kind of shortcut,
      // and the popup will close anyway.
      // Don't send keys if the user's in private browsing mode.
      this._sendPrintableKey();
    }
  },
  onFocus: function(evt) {},
  onBlur: function(evt) {},
  onKeyPress: function(evt) {},
  onMouseDown: function(evt) {},
  onPaste: function(evt) {},
  onDrop: function(evt) {},
  onPopupOpen: function() {
    // clear any timeouts left over from the last run
    this.win.clearTimeout(this.urlbarUpdateTimer);
    this.urlbarUpdateTimer = null;
    this.win.clearTimeout(this.urlbarNavigateTimer);
    this.urlbarNavigateTimer = null;
  }
};
