'use strict';

// TODO: bootstrapped extensions cache strings, scripts, etc forever.
//       figure out when and how to cache-bust.
//       bugs 918033, 1051238, 719376

/* global Components, CustomizableUI, Services, XPCOMUtils */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'WebChannel',
  'resource://gre/modules/WebChannel.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'console',
  'resource://gre/modules/devtools/Console.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'CustomizableUI',
  'resource:///modules/CustomizableUI.jsm');

const EXPORTED_SYMBOLS = ['Main']; // eslint-disable-line no-unused-vars

const onTabSelect = function() { console.log('onTabSelect'); };
const onTabOpen = function() { console.log('onTabOpen'); };
const onTabClose = function() { console.log('onTabClose'); };

const loadIntoWindow = function(win) {
  console.log('loadIntoWindow start');

  const document = win.document;

  // set the app global per-window
  if (win.US === undefined) {
    Object.defineProperty(win, 'US', {configurable: true, value: {}});
  } else {
    win.US = win.US || {};
  }

  // we refer to the app global as 'app' everywhere else, so do it here too
  const app = win.US;

  // hide the search bar, if it's visible; this will be null if not
  const searchBarLocation = CustomizableUI.getPlacementOfWidget('search-container');
  if (searchBarLocation) {
    app.searchBarLocation = searchBarLocation;
    CustomizableUI.removeWidgetFromArea('search-container');
  }

  // unified complete changes the behavior of the code we modify, so detect
  // if we're a version of FF (43 and up) that includes unified complete
  const appInfo = Cc['@mozilla.org/xre/app-info;1']
                .getService(Ci.nsIXULAppInfo);
  const versionChecker = Cc['@mozilla.org/xpcom/version-comparator;1']
                       .getService(Ci.nsIVersionComparator);
  app.hasUnifiedComplete = versionChecker.compare(appInfo.version, '43') >= 0;

  // load all scripts into the window
  Cu.import('chrome://universalsearch-lib/content/Broker.js', app);
  Cu.import('chrome://universalsearch-lib/content/Transport.js', app);
  Cu.import('chrome://universalsearch-lib/content/ui/Popup.js', app);
  Cu.import('chrome://universalsearch-lib/content/ui/Urlbar.js', app);

  // load the CSS into the document. not using the stylesheet service.
  const stylesheet = document.createElementNS('http://www.w3.org/1999/xhtml', 'h:link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'chrome://universalsearch-root/content/skin/binding.css';
  stylesheet.type = 'text/css';
  stylesheet.style.display = 'none';
  document.documentElement.appendChild(stylesheet);

  // constructor injection of app global for non-UI classes, as needed
  app.broker = new app.Broker();

  app.transport = new app.Transport(app);
  app.transport.init();

  // constructor injection of window, needed by UI classes, plus app
  app.popup = new app.Popup(win, app);
  app.popup.render();

  app.urlbar = new app.Urlbar(win, app);
  app.urlbar.render();

  app.gURLBar = win.gURLBar;
  app.gBrowser = win.gBrowser;

  app.gBrowser.tabContainer.addEventListener('TabSelect', onTabSelect);
  app.gBrowser.tabContainer.addEventListener('TabOpen', onTabOpen);
  app.gBrowser.tabContainer.addEventListener('TabClose', onTabClose);
};

// basically reverse the loadIntoWindow function
const unloadFromWindow = function(win) {
  console.log('unloadFromWindow start');

  const app = win.US;

  app.gBrowser.tabContainer.removeEventListener('TabSelect', onTabSelect);
  app.gBrowser.tabContainer.removeEventListener('TabOpen', onTabOpen);
  app.gBrowser.tabContainer.removeEventListener('TabClose', onTabClose);
  app.urlbar.remove();
  app.popup.remove();

  app.transport.shutdown();
  app.broker.shutdown();

  // show the search bar, if it was visible originally
  if (app.searchBarLocation) {
    const loc = app.searchBarLocation;
    CustomizableUI.addWidgetToArea('search-container', loc.area, loc.position);
  }

  // TODO: remove stylesheets (#105)

  // unload scripts
  Cu.unload('chrome://universalsearch-lib/content/Broker.js', app);
  Cu.unload('chrome://universalsearch-lib/content/Transport.js', app);
  Cu.unload('chrome://universalsearch-lib/content/ui/Popup.js', app);
  Cu.unload('chrome://universalsearch-lib/content/ui/Urlbar.js', app);

  // delete any dangling refs
  delete win.US;
};

function onWindowLoaded(evt) {
  // Gecko forces us to do unseemly things to obtain a XUL window reference
  const win = evt.target.ownerGlobal;
  win.removeEventListener('load', onWindowLoaded, false);
  if (win.location.href === 'chrome://browser/content/browser.xul') {
    loadIntoWindow(win);
  }
}

function onWindowNotification(win, topic) {
  if (topic !== 'domwindowopened') { return; }
  console.log('iterating windows');
  win.addEventListener('load', onWindowLoaded, false);
}

function load() {
  const enumerator = Services.wm.getEnumerator('navigator:browser');
  while (enumerator.hasMoreElements()) {
    const win = enumerator.getNext();
    try {
      loadIntoWindow(win);
    } catch (ex) {
      console.log('load into window failed: ', ex);
    }
  }
  Services.ww.registerNotification(onWindowNotification);
}

function unload() {
  const enumerator = Services.wm.getEnumerator('navigator:browser');
  while (enumerator.hasMoreElements()) {
    const win = enumerator.getNext();
    try {
      unloadFromWindow(win);
    } catch (ex) {
      console.log('unload from window failed: ', ex);
    }
  }
  Services.ww.unregisterNotification(onWindowNotification);
}

const Main = { load: load, unload: unload }; // eslint-disable-line no-unused-vars
