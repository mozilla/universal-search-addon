'use strict';

// transport wraps the WebChannel and is exposed via the main pubsub broker.
// The transport also knows how to transform events into the form expected by
// the iframe. This is a little weird, but keeps individual UI objects ignorant
// of the transport.

/* global Cc, Ci, Services, XPCOMUtils, WebChannel */

XPCOMUtils.defineLazyModuleGetter(this, 'WebChannel',
  'resource://gre/modules/WebChannel.jsm');

function Transport() {
  const prefBranch = Cc['@mozilla.org/preferences-service;1']
                   .getService(Ci.nsIPrefService)
                   .getBranch('');
  this.frameBaseURL = prefBranch.getPrefType('services.universalSearch.baseURL') ?
                        prefBranch.getCharPref('services.universalSearch.baseURL') :
                        'https://d1fnkpeapwua2i.cloudfront.net';
  this.port = null;
  this._lastAutocompleteSearchTerm = '';
  this._lastSuggestedSearchTerm = '';
}

Transport.prototype = {
  constructor: Transport,
  channelID: 'ohai',
  init: function() {
    // intentionally alphabetized
    window.US.broker.subscribe('popup::autocompleteSearchResults',
                               this.onAutocompleteSearchResults, this);
    window.US.broker.subscribe('popup::popupClose', this.onPopupClose, this);
    window.US.broker.subscribe('popup::popupOpen', this.onPopupOpen, this);
    window.US.broker.subscribe('popup::suggestedSearchResults',
                               this.onSuggestedSearchResults, this);
    window.US.broker.subscribe('urlbar::navigationalKey',
                               this.onNavigationalKey, this);

    this.port = new WebChannel(this.channelID,
                               Services.io.newURI(this.frameBaseURL, null, null));
    this.port.listen(this.onContentMessage.bind(this));
  },
  shutdown: function() {
    if (this.port) {
      this.port.stopListening();
    }

    window.US.broker.unsubscribe('popup::autocompleteSearchResults',
                                 this.onAutocompleteSearchResults, this);
    window.US.broker.unsubscribe('popup::popupClose', this.onPopupClose, this);
    window.US.broker.unsubscribe('popup::popupOpen', this.onPopupOpen, this);
    window.US.broker.unsubscribe('popup::suggestedSearchResults',
                                 this.onSuggestedSearchResults, this);
    window.US.broker.unsubscribe('urlbar::navigationalKey',
                                 this.onNavigationalKey, this);
  },
  onContentMessage: function(id, msg, sender) {
    if (id !== this.channelID) { return; }
    window.US.broker.publish('iframe::' + msg.type, msg.data);
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
      browser: window.US.browser,
      principal: Cc['@mozilla.org/systemprincipal;1']
                 .createInstance(Ci.nsIPrincipal)
    };
    this.port.send(msg, ctx);
  }
};
