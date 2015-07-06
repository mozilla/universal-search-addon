// urlbar listeners and event handlers

'use strict';

var EXPORTED_SYMBOLS = ['Urlbar'];

function Urlbar() {}
Urlbar.prototype = {
  // replaced handlers and elements
  replaced: {},
  render: function(win) {
    this.urlbar = win.document.getElementById('urlbar');
    this.replaced._autocompletepopup = this.urlbar.getAttribute('autocompletepopup');
    this.urlbar.setAttribute('autocompletepopup', 'PopupAutoCompleteRichResultUnivSearch');

    this.urlbar.addEventListener('focus', this.onFocus.bind(this));
    this.urlbar.addEventListener('blur', this.onBlur.bind(this));
    this.urlbar.addEventListener('keydown', this.onKeyDown.bind(this));
    this.urlbar.addEventListener('keypress', this.onKeyPress.bind(this));
    this.urlbar.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.urlbar.addEventListener('paste', this.onPaste.bind(this));
    this.urlbar.addEventListener('drop', this.onDrop.bind(this));
  },
  derender: function() {
    this.urlbar.removeEventListener('focus', this.onFocus.bind(this));
    this.urlbar.removeEventListener('blur', this.onBlur.bind(this));
    this.urlbar.removeEventListener('keydown', this.onKeyDown.bind(this));
    this.urlbar.removeEventListener('keypress', this.onKeyPress.bind(this));
    this.urlbar.removeEventListener('mousedown', this.onMouseDown.bind(this));
    this.urlbar.removeEventListener('paste', this.onPaste.bind(this));
    this.urlbar.removeEventListener('drop', this.onDrop.bind(this));

    // reconnect original popup to the urlbar
    this.urlbar.setAttribute('autocompletepopup', this.replaced._autocompletepopup);
  },
  onFocus: function(evt) {},
  onBlur: function(evt) {},

  // TODO: this is the original logic from the gecko prototype. maybe we want
  //       to rethink a bit.
  onKeyDown: function(evt) {
    console.log('Urlbar.onKeyDown');
    var gURLBar = this.urlbar;
    var gBrowser = window.gBrowser;

    if (evt.ctrlKey || evt.altKey || evt.metaKey) {
      // special keys could mean a hotkey combination, so bail
      // TODO: extract port from popup so that urlbar can use it too
      US.popup.port.send({ type: 'popupclose' }, {
        browser: US.popup.browser,
        principal: Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal)
      });
      US.popup.popup.closePopup();
    } else if (['ArrowLeft', 'ArrowRight', 'Escape', 'Enter', 'Backspace'].indexOf(evt.key) > -1) {
      // if there was only one char in the urlbar, then the backspace will empty it out, so we should
      // hide the popup. but if there's more than one char in there, we'll probably get some results
      // from autocomplete searching on the substring in just a moment, so do nothing.
      // TODO: when we reimplement the controller, actually check the location of the cursor...the backspace
      // could do nothing if it was in front of the character. And we shoudl probably check for cursor location
      // and listen for the Del key too. And the trim() call could also mess things up. Selections are a real PITA ;-)
      if (evt.key == 'Backspace' && gURLBar.inputField.value.trim().length > 1) { return; }

      // ok, if the user selected something, we set state on gURLBar.
      if (evt.key == 'Enter') {
        if (gURLBar.search && gURLBar.search.term == gURLBar.value) {
          // the user selected a search suggestion via keypresses, then hit enter.
          // we know the suggestion is not stale, because it matches the current contents
          // of the urlbar. So, navigate to the hidden search URL that corresponds to the term.
          gBrowser.loadURI(gURLBar.search.url);
          gURLBar.search = null;
        } else {
          // hmm, when we key over non-search values, hitting enter doesn't quite work.
          // maybe just surf to whatever's in the urlbar?
          gBrowser.loadURI(gURLBar.value);
        }
      }

      // we need to close the popup; tell the iframe
      US.popup.port.send({ type: 'popupclose' }, {
        browser: US.popup.browser,
        principal: Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal)
      });
      US.popup.popup.closePopup();
    } else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Tab'].indexOf(evt.key) > -1) {
      // TODO: either duplicate or simply reuse the remaining key handling behavior below, like the bit
      // where we ignore keys that are part of a keyboard shortcut
      US.popup.port.send({
        type: 'navigational-key',
        data: {
          key: evt.key,
          shiftKey: evt.shiftKey
        }
      }, {
        browser: US.popup.browser,
        principal: Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal)
      });
    }

    // TODO: pull in the other handler behavior
  },
  onKeyPress: function(evt) {
    console.log('Urlbar.onKeyPress');
  },
  onMouseDown: function(evt) {},
  onPaste: function(evt) {},
  onDrop: function(evt) {}
};
