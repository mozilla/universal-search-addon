// urlbar listeners and event handlers

'use strict';

var EXPORTED_SYMBOLS = ['Urlbar'];

function Urlbar() {}
Urlbar.prototype = {
  // replaced handlers and elements
  replaced: {},
  init: function() {},
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
    // do something with this.replaced, the replaced els
    // unhook all the listeners
  },
  onFocus: function(evt) {},
  onBlur: function(evt) {},
  onKeyDown: function(evt) {},
  onKeyPress: function(evt) {},
  onMouseDown: function(evt) {},
  onPaste: function(evt) {},
  onDrop: function(evt) {}
};
