'use strict';

// transport wraps the WebChannel and is exposed via the main pubsub broker.
// The transport also knows how to transform events into the form expected by
// the iframe. This is a little weird, but keeps individual UI objects ignorant
// of the transport.

/* global Components, Services, WebChannel, XPCOMUtils */

const {utils: Cu, interfaces: Ci, classes: Cc} = Components;

const EXPORTED_SYMBOLS = ['Transport']; // eslint-disable-line no-unused-vars

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'WebChannel',
  'resource://gre/modules/WebChannel.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'console',
  'resource://gre/modules/devtools/Console.jsm');

function Transport(appGlobal) {
  this.app = appGlobal;

  const prefBranch = Cc['@mozilla.org/preferences-service;1']
                   .getService(Ci.nsIPrefService)
                   .getBranch('');
  this.frameBaseURL = prefBranch.getPrefType('services.universalSearch.baseURL') ?
                        prefBranch.getCharPref('services.universalSearch.baseURL') :
                        'https://d1fnkpeapwua2i.cloudfront.net';
  this.port = null;
  // channelId must be unique to each window (#64)
  this.channelId = 'ohai-' + Math.floor(Math.random() * 100000);
  this._lastAutocompleteSearchTerm = '';
  this._lastSuggestedSearchTerm = '';
}

Transport.prototype = {
  constructor: Transport,
  init: function() {
    // intentionally alphabetized
    this.app.broker.subscribe('popup::autocompleteSearchResults',
                               this.onAutocompleteSearchResults, this);
    this.app.broker.subscribe('popup::popupClose', this.onPopupClose, this);
    this.app.broker.subscribe('popup::popupOpen', this.onPopupOpen, this);
    this.app.broker.subscribe('popup::suggestedSearchResults',
                               this.onSuggestedSearchResults, this);
    this.app.broker.subscribe('urlbar::navigationalKey',
                               this.onNavigationalKey, this);
    this.app.broker.subscribe('urlbar::printableKey',
                               this.onPrintableKey, this);

    this.port = new WebChannel(this.channelId,
                               Services.io.newURI(this.frameBaseURL, null, null));
    this.port.listen(this.onContentMessage.bind(this));
  },
  shutdown: function() {
    if (this.port) {
      this.port.stopListening();
    }

    this.app.broker.unsubscribe('popup::autocompleteSearchResults',
                                 this.onAutocompleteSearchResults, this);
    this.app.broker.unsubscribe('popup::popupClose', this.onPopupClose, this);
    this.app.broker.unsubscribe('popup::popupOpen', this.onPopupOpen, this);
    this.app.broker.unsubscribe('popup::suggestedSearchResults',
                                 this.onSuggestedSearchResults, this);
    this.app.broker.unsubscribe('urlbar::navigationalKey',
                                 this.onNavigationalKey, this);
    this.app.broker.unsubscribe('urlbar::printableKey',
                               this.onPrintableKey, this);
  },
  onContentMessage: function(id, msg, sender) {
    if (id !== this.channelId) { return; }
    this.app.broker.publish('iframe::' + msg.type, msg.data);
  },
  // Dedupe sequential messages if the user input hasn't changed. See #18 and
  // associated commit message for gnarly details.
  //
  // Note, there is some duplication in the deduping logic in these two fns.
  // However, I'm not sure the result of functional decomposition (extracting
  // the dedupe function into a memoize-like combinator) would actually yield
  // more understandable or readable code than what we've got here. :-\
  onAutocompleteSearchResults: function(msg) {
    const currentInput = msg && msg.length && msg[0].text;
    if (currentInput && currentInput === this._lastAutocompleteSearchTerm) {
      return;
    }
    this._lastAutocompleteSearchTerm = currentInput;
    this.sendMessage('autocomplete-search-results', msg);
  },
  onSuggestedSearchResults: function(msg) {
    const currentInput = msg && msg.term;
    if (currentInput && currentInput === this._lastSuggestedSearchTerm) {
      return;
    }
    this._lastSuggestedSearchTerm = currentInput;
    this.sendMessage('suggested-search-results', { results: msg });
  },
  onNavigationalKey: function(msg) {
    this.sendMessage('navigational-key', msg);
  },
  onPrintableKey: function(msg) {
    this.sendMessage('printable-key', msg);
  },
  onPopupOpen: function(msg) {
    this.sendMessage('popupopen');
  },
  onPopupClose: function(msg) {
    this.sendMessage('popupclose');
  },
  sendMessage: function(evt, data) {
    const msg = {
      type: evt,
      data: data || null
    };
    console.log('sending the ' + evt + ' message to content:' + JSON.stringify(msg));
    const ctx = {
      browser: this.app.browser,
      principal: Cc['@mozilla.org/systemprincipal;1']
                 .createInstance(Ci.nsIPrincipal)
    };
    this.port.send(msg, ctx);
  }
};
