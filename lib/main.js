// TODO: bootstrapped extensions cache strings, scripts, etc forever.
//       figure out when and how to cache-bust.
//       bugs 918033, 1051238, 719376

const { classes: Cc, interfaces: Ci, utils: Cu, manager: Cm } = Components;
Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'WebChannel',
  'resource://gre/modules/WebChannel.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'console',
  'resource://gre/modules/devtools/Console.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'CustomizableUI',
  'resource:///modules/CustomizableUI.jsm');

var EXPORTED_SYMBOLS = ['Main'];

var onTabSelect = function() { console.log('onTabSelect'); };
var onTabOpen = function() { console.log('onTabOpen'); };
var onTabClose = function() { console.log('onTabClose'); };

var loadIntoWindow = function(win) {
  console.log('loadIntoWindow start');

  var document = win.document;

  // set the app global per-window
  if(win.US === undefined) {
      Object.defineProperty(win, 'US', {configurable:true, value:{}});
  } else {
      win.US = win.US || {};
  }

  // hide the search bar
  CustomizableUI.removeWidgetFromArea('search-container');

  // use Services.scriptloader.loadSubScript to load any addl scripts.
  Services.scriptloader.loadSubScript('chrome://universalsearch-lib/content/ui/Popup.js', win);
  Services.scriptloader.loadSubScript('chrome://universalsearch-lib/content/ui/Urlbar.js', win);
  Services.scriptloader.loadSubScript('chrome://universalsearch-lib/content/ui/GoButton.js', win);

  // load the CSS into the document. not using the stylesheet service.
  var stylesheet = document.createElementNS('http://www.w3.org/1999/xhtml', 'h:link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'chrome://universalsearch-root/content/skin/binding.css';
  stylesheet.type = 'text/css';
  stylesheet.style.display = 'none';
  document.documentElement.appendChild(stylesheet);

  // create the popup and append it to the dom.
  win.US.popup = new win.Popup();
  win.US.popup.render(win);

  // grab node pointers and swap the popup into the DOM.
  win.US.urlbar = new win.Urlbar();
  win.US.urlbar.render(win);
  win.US.gURLBar = win.gURLBar;

  // add urlbar and gBrowser.tabContainer listeners
  // obviously we won't put everything top-level on the app namespace, just sketching here
  win.gBrowser.tabContainer.addEventListener('TabSelect', onTabSelect);
  win.gBrowser.tabContainer.addEventListener('TabOpen', onTabOpen);
  win.gBrowser.tabContainer.addEventListener('TabClose', onTabClose);

  // deal with the "go button" (right arrow that appears when you type in the bar)
  win.US.goButton = new win.GoButton();
  win.US.goButton.render(win);

  // we call this function when the XBL loads, so we can get a pointer to the anonymous
  // browser element.
  win.US.setBrowser = function(browserEl) {
    win.US.browser = browserEl;
  }
};

// basically reverse the loadIntoWindow function
var unloadFromWindow = function(win) {
  console.log('unloadFromWindow start');

  var document = win.document;
  win.US.goButton.derender(win);
  win.gBrowser.tabContainer.removeEventListener('TabSelect', onTabSelect);
  win.gBrowser.tabContainer.removeEventListener('TabOpen', onTabOpen);
  win.gBrowser.tabContainer.removeEventListener('TabClose', onTabClose);
  win.US.urlbar.derender(win);
  win.US.popup.derender(win);

  // TODO: not sure these steps are technically necessary:
  // remove stylesheet
  // remove subscripts (not sure this is possible, can we just remove the app global?)
};

function onWindowNotification(win, topic) {
  if (topic !== 'domwindowopened') { return; }
  console.log('iterating windows');
  win.addEventListener('load', function loader() {
    win.removeEventListener('load', loader, false);
    if (win.location.href == 'chrome://browser/content/browser.xul') {
      loadIntoWindow(win);
    }
  }, false);
}

// 1. Extension.load: get a window enumerator, and load the code into each window.
function load() {
  var enumerator = Services.wm.getEnumerator('navigator:browser');
  while (enumerator.hasMoreElements()) {
    var win = enumerator.getNext();
    try { 
      loadIntoWindow(win);
    } catch (ex) {
      console.log('load into window failed: ', ex);
    }
  }
  Services.ww.registerNotification(onWindowNotification);
};

function unload() {
  var enumerator = Services.wm.getEnumerator('navigator:browser');
  while (enumerator.hasMoreElements()) {
    var win = enumerator.getNext();
    try {
      unloadFromWindow(win);
    } catch (ex) {
      console.log('unload from window failed: ', ex);
    }
  }
  Services.ww.unregisterNotification(onWindowNotification);
}

var Main = { load: load, unload: unload };
