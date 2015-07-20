'use strict';

/* global APP_SHUTDOWN, ADDON_DISABLE, ADDON_UNINSTALL, Components, XPCOMUtils, Main */

const { utils: Cu } = Components;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Main',
  'chrome://universalsearch-lib/content/main.js');

function startup(data, reason) { // eslint-disable-line no-unused-vars
  console.log('bootstrap startup called');
  Main.load();
}

function shutdown(data, reason) { // eslint-disable-line no-unused-vars
  console.log('bootstrap shutdown called');
  // no teardown is needed for a normal shutdown
  if (reason === APP_SHUTDOWN) { return; }

  if (reason === ADDON_DISABLE || reason === ADDON_UNINSTALL) {
    // uninstall / offboarding experience? ask for feedback?
    // TODO: xhr the uninstall event to a server
  }

  // the reason is either disable, uninstall, or shutdown is firing
  // because we're in the middle of a downgrade/upgrade. In any of
  // these cases, we want to unload the current code.
  Main.unload();
}

function install(data, reason) { // eslint-disable-line no-unused-vars
  console.log('bootstrap install called');
  // upsell? product tour? other first time experience?
  // TODO: xhr the install event to a server
}

function uninstall(data, reason) { // eslint-disable-line no-unused-vars
  console.log('bootstrap uninstall called');
}
