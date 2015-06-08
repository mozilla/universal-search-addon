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
XPCOMUtils.defineLazyModuleGetter(this, 'ToolbarButtonManager',
  'chrome://universalsearch-lib/content/third-party/ToolbarButtonManager.js');

var EXPORTED_SYMBOLS = ['Main'];

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
  ToolbarButtonManager.hideToolbarElement(win.document, 'search-container');

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

  // add urlbar and gBrowser.tabContainer listeners
  // obviously we won't put everything top-level on the app namespace, just sketching here
  win.gBrowser.tabContainer.addEventListener('TabSelect', function onTabSelect() {
    console.log('onTabSelect');
  });
  win.gBrowser.tabContainer.addEventListener('TabOpen', function onTabOpen() {
    console.log('onTabOpen');
  });
  win.gBrowser.tabContainer.addEventListener('TabClose', function onTabClose() {
    console.log('onTabClose');
  });

  // deal with the "go button" (right arrow that appears when you type in the bar)
  win.US.goButton = new win.GoButton();
  win.US.goButton.render(win);

  // we call this function when the XBL loads, so we can get a pointer to the anonymous
  // browser element.
  win.US.setBrowser = function(browserEl) {
    win.US.browser = browserEl;
  }
};

// 1. Extension.load: get a window enumerator, and load the code into each window.
function load() {
  console.log('load start');
  var enumerator = Services.wm.getEnumerator('navigator:browser');
  while (enumerator.hasMoreElements()) {
    console.log('enumerator has a window');
    var win = enumerator.getNext();
    try { 
      loadIntoWindow(win);
    } catch (ex) {
      console.log('load into window failed: ', ex);
    }
  }
  Services.ww.registerNotification(function(win, topic) {
    if (topic == 'domwindowopened') {
    console.log('iterating windows');
      win.addEventListener('load', function loader() {
        win.removeEventListener('load', loader, false); 
        if (win.location.href == 'chrome://browser/content/browser.xul') {
          loadIntoWindow(win);
        }
      }, false);
    }
  });
};

var Main = { load: load };
