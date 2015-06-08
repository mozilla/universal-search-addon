// JS for the "go button" (right arrow that appears when you type in the urlbar)

'use strict';

var EXPORTED_SYMBOLS = [ 'GoButton' ];

function GoButton() {}
GoButton.prototype = {
  // replaced handlers and elements
  replaced: {},
  render: function(win) {
    this.button = document.getElementById('urlbar-go-button');
    this.replaced.goButtonClick = this.button.getAttribute('onclick');
    // add our handler, fall through to the existing go button behavior
    this.button.setAttribute('onclick', 'US.goButton.onClick(); ' + this.replaced.goButtonClick);
  },
  onClick: function(evt) {
    console.log('goButton clicked');
    return false; // let's not fall through for now
  }
};

