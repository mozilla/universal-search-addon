// urlbar listeners and event handlers

'use strict';

/* global Cc, Ci, US */

var EXPORTED_SYMBOLS = ['Urlbar'];

function Urlbar() {}
Urlbar.prototype = {
  // replaced handlers and elements
  replaced: {},
  isRendered: false,
  render: function(win) {
    // needed to avoid overwriting the handlers by reapplying the .bind()
    if (this.isRendered) { return; }
    this.isRendered = true;

    this.urlbar = win.document.getElementById('urlbar');
    this.replaced._autocompletepopup = this.urlbar.getAttribute('autocompletepopup');
    this.urlbar.setAttribute('autocompletepopup', 'PopupAutoCompleteRichResultUnivSearch');

    this.urlbar.addEventListener('focus', this.onFocus);
    this.urlbar.addEventListener('blur', this.onBlur);
    this.urlbar.addEventListener('keydown', this.onKeyDown);
    this.urlbar.addEventListener('keypress', this.onKeyPress);
    this.urlbar.addEventListener('mousedown', this.onMouseDown);
    this.urlbar.addEventListener('paste', this.onPaste);
    this.urlbar.addEventListener('drop', this.onDrop);

    // refresh the urlbar
    this.urlbar.parentNode.insertBefore(this.urlbar, this.urlbar.nextSibling);
  },
  derender: function() {
    // reconnect original popup to the urlbar
    this.urlbar.setAttribute('autocompletepopup', this.replaced._autocompletepopup);

    this.urlbar.removeEventListener('focus', this.onFocus);
    this.urlbar.removeEventListener('blur', this.onBlur);
    this.urlbar.removeEventListener('keydown', this.onKeyDown);
    this.urlbar.removeEventListener('keypress', this.onKeyPress);
    this.urlbar.removeEventListener('mousedown', this.onMouseDown);
    this.urlbar.removeEventListener('paste', this.onPaste);
    this.urlbar.removeEventListener('drop', this.onDrop);

    // refresh the urlbar
    this.urlbar.parentNode.insertBefore(this.urlbar, this.urlbar.nextSibling);

    this.isRendered = false;
  },
  onFocus: function(evt) {},
  onBlur: function(evt) {},

  // TODO: this is the original logic from the gecko prototype. maybe we want
  //       to rethink a bit.
  onKeyDown: function(evt) {
    console.log('Urlbar.onKeyDown');

    var gURLBar = window.gURLBar;
    var gBrowser = window.gBrowser;

    if (evt.ctrlKey || evt.altKey || evt.metaKey) {
      // special keys could mean a hotkey combination, so bail
      // popup will send the notification down to the iframe
      US.popup.popup.closePopup();
    } else if (['ArrowLeft', 'ArrowRight', 'Escape', 'Enter', 'Backspace'].indexOf(evt.key) > -1) {
      // if there was only one char in the urlbar, then the backspace will empty it out, so we should
      // hide the popup. but if there's more than one char in there, we'll probably get some results
      // from autocomplete searching on the substring in just a moment, so do nothing.
      // TODO: when we reimplement the controller, actually check the location of the cursor...the backspace
      // could do nothing if it was in front of the character. And we shoudl probably check for cursor location
      // and listen for the Del key too. And the trim() call could also mess things up. Selections are a real PITA ;-)
      if (evt.key === 'Backspace' && gURLBar.inputField.value.trim().length > 1) { return; }

      // ok, if the user selected something, we set state on gURLBar.
      if (evt.key === 'Enter') {
        if (gURLBar.search && gURLBar.search.term === gURLBar.value) {
          // the user selected a search suggestion via keypresses, then hit enter.
          // we know the suggestion is not stale, because it matches the current contents
          // of the urlbar. So, navigate to the hidden search URL that corresponds to the term.
          gBrowser.loadURI(gURLBar._search.url);
          gURLBar._search = null;
        } else {
          // hmm, when we key over non-search values, hitting enter doesn't quite work.
          // maybe just surf to whatever's in the urlbar?
          gBrowser.loadURI(gURLBar.value);
        }
      }

      // we need to close the popup; tell the iframe
      // again, the popup listens for close events + sends the message to the iframe
      US.popup.popup.closePopup();
    } else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Tab'].indexOf(evt.key) > -1) {
      // TODO: either duplicate or simply reuse the remaining key handling behavior below, like the bit
      // where we ignore keys that are part of a keyboard shortcut
      var msg = {
        type: 'navigational-key',
        data: {
          key: evt.key,
          shiftKey: evt.shiftKey
        }
      };
      console.log('browser sending message to iframe: ', msg);
      US.popup.port.send(msg, {
        browser: US.popup.browser,
        principal: Cc['@mozilla.org/systemprincipal;1'].createInstance(Ci.nsIPrincipal)
      });
    }

    // TODO: pull in the other handler behavior
  },
  onKeyPress: function(evt) {},
  onMouseDown: function(evt) {},
  onPaste: function(evt) {},
  onDrop: function(evt) {}
};
