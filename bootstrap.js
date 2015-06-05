
'use strict';

// TODO require is undefined?
// var {Cc, Ci, Cu} = require("chrome");
//Cu.import("resource://gre/modules/Services.jsm");
//Cu.import("resource://gre/modules/WebChannel.jsm");

function install() {
  console.log('installing');
}
function uninstall() {
  console.log('uninstalling');
}

// startup is called:
// - when extension is first installed (assuming it's enabled)
// - when extension becomes enabled via addons window
// - when FF starts, if the extension is enabled
function startup(data, reason) {
  // define the app namespace
  window.UNIVSEARCH = window.UNIVSEARCH || {};

  // hide the search bar
  Cu.import('chrome://the-addon/ToolbarButtonManager.jsm');
  ToolbarButtonManager.hideToolbarElement(window.document, 'search-container');

  // create the popup element
  var popup = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "panel");
  popup.setAttribute("type", 'autocomplete-richlistbox');
  popup.setAttribute("id", 'PopupAutoCompleteRichResultUnivSearch');
  document.getElementById('PopupAutoCompleteRichResult').parentElement.appendChild(popup);
  var urlbar = document.getElementById('urlbar');
  UNIVSEARCH.elements = {
    popup: popup,
    urlbar: urlbar
  };

  // dynamically append the stylesheet which binds the autocomplete popup
  var stylesheet = window.document.createElementNS('http://www.w3.org/1999/xhtml', 'h:link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'chrome://the-addon/content/skin/binding.css';
  stylesheet.type = 'text/css';
  stylesheet.style.display = 'none';
  window.document.documentElement.appendChild(stylesheet);

  // TODO dynamically set the src on the iframe, then set up messaging when it loads

  // override some stuff on the urlbar
  UNIVSEARCH.replaced = {};
  // TODO: implement this...
  // UNIVSEARCH.replaced.autocompletesearch = urlbar.getAttribute('autocompletesearch');
  // urlbar.setAttribute('autocompletesearch', 'univ-search-results');
  UNIVSEARCH.replaced.autocompletepopup = urlbar.getAttribute('autocompletepopup');
  urlbar.setAttribute('autocompletepopup', 'PopupAutoCompleteRichResultUnivSearch');

  // add urlbar and gBrowser.tabContainer listeners
  // obviously we won't put everything top-level on the app namespace, just sketching here
  popup.addEventListener('popuphiding', UNIVSEARCH.onPopupHiding);
  popup.addEventListener('popupshowing', UNIVSEARCH.onPopupShowing);
  gBrowser.tabContainer.addEventListener('TabSelect', UNIVSEARCH.onTabSelect);
  gBrowser.tabContainer.addEventListener('TabOpen', UNIVSEARCH.onTabOpen);
  gBrowser.tabContainer.addEventListener('TabClose', UNIVSEARCH.onTabClose);
  // TODO add urlbar listeners

  // deal with the "go button" (right arrow that appears when you type in the bar)
  var goButton = document.getElementById('urlbar-go-button');
  UNIVSEARCH.elements.goButton = goButton;
  UNIVSEARCH.replaced.goButtonClick = goButton.getAttribute('onclick');
  // add our handler, fall through to the existing go button behavior
  goButton.setAttribute('onclick', 'UNIVSEARCH.goButtonClick(); ' + UNIVSEARCH.replaced.goButtonClick);

  // TODO add history dropmarker stanza
}

// shutdown is called:
// - when extension is uninstalled, if currently enabled
// - when extension becomes disabled
// - when FF shuts down, if the extension is enabled
function shutdown(data, reason) {
  console.log('shutting down');
}
