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

let isTabListening = false;

function scrapePage(browser) {
  // do stuff!
  // existing code seems to set a timeout, then if the user scrolls,
  // bump the timeout. if the user closes the tab, abort.
  // when the timeout is done, scrape. browser-thumbnails.js does this.
  // readermode might, too.
  console.log('detected a tab loaded with url ', browser._contentWindow.document.URL);
  let doc = browser._contentWindow.document;

  // ok. start with the low hanging fruit, grabbing everything out of the DOM.
  // TODO: later, be smart; don't naively try to grab all these tags.
  // TODO: also later, if we didn't get any images, attempt to scrape ourselves,
  // using stuff like PageThumbs and ReaderMode

  function get(selector) {
    let el = doc.querySelector(selector);
    return el && el.getAttribute('content');
  }

  const data = {
    // grab opengraph metadata, if we have it
    og: {
      desc: get('meta[property="og:description"]'),
      img: {
        url: get('meta[property="og:image"]'),
        type: get('meta[property="og:image:type"]')
      },
      siteName: get('meta[property="og:site_name"]'),
      title: get('meta[property="og:title"]'),
      type: get('meta[property="og:type"]')
    },
    // grab twitter data, if we have it
    tw: {
      desc: get('meta[property="twitter:description"]'),
      img: {
        url: get('meta[property="twitter:image"]')
      },
      // note, this'll be a twitter username, like '@foo', not a site name, but whatever
      siteName: get('meta[property="twitter:site"]'),
      title: get('meta[property="twitter:title"]'),
      // and this'll be a twitter card, slightly different types vs og
      type: get('meta[property="twitter:card"]')
    }
  };

  // hopefully we have an image; otherwise, give up, I guess
  let imgUrl = data.og.img.url || data.tw.img.url;
  if (imgUrl) {
    // TODO NEXT: grab and save the image 
  }
}

// leaning on browser/base/content/browser-thumbnails.js onStateChange method here
const myProgressListener = {
  onStateChange: function (browser, progress, request, flags, status) {
    if (flags & Ci.nsIWebProgressListener.STATE_STOP &&
        flags & Ci.nsIWebProgressListener.STATE_IS_NETWORK) {
      scrapePage(browser);
    }
  }
};

const loadIntoWindow = function(win) {
  console.log('loadIntoWindow start');

  if (!isTabListening) {
    // only do this once per firefox.
    isTabListening = true;

    // listen for all dom windows and do special stuff there.
    console.log('just inside load method, does gBrowser exist?', win.gBrowser);
    win.gBrowser.addTabsProgressListener(myProgressListener);
  }

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
  Cu.import('chrome://universalsearch-lib/content/PlacesSearch.js', app);

  // load the CSS into the document. not using the stylesheet service.
  const stylesheet = document.createElementNS('http://www.w3.org/1999/xhtml', 'h:link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'chrome://universalsearch-root/content/skin/binding.css';
  stylesheet.type = 'text/css';
  stylesheet.style.display = 'none';
  document.documentElement.appendChild(stylesheet);

  // constructor injection of app global for non-UI classes, as needed
  app.broker = new app.Broker();
  app.placesSearch = new app.PlacesSearch();
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

  // if we're unloading, then we can remove our gBrowser listener.
  if (isTabListening) {
    // only do this once per firefox.
    isTabListening = false;

    win.gBrowser.removeTabsProgressListener(myProgressListener);
  }

  const app = win.US;

  app.gBrowser.tabContainer.removeEventListener('TabSelect', onTabSelect);
  app.gBrowser.tabContainer.removeEventListener('TabOpen', onTabOpen);
  app.gBrowser.tabContainer.removeEventListener('TabClose', onTabClose);
  app.urlbar.remove();
  app.popup.remove();

  app.transport.shutdown();
  app.placesSearch.shutdown();
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
  Cu.unload('chrome://universalsearch-lib/content/PlacesSearch.js', app);

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
