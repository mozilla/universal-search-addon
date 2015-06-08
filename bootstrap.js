'use strict';

const { classes: Cc, interfaces: Ci, utils: Cu, manager: Cm } = Components;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Main',
  'chrome://universalsearch-lib/content/main.js');

function startup(data, reason) {
  Main.load();
}

function shutdown(data, reason) {
  // no teardown is needed for a normal shutdown
  if (reason == APP_SHUTDOWN) { return; }

  var winMediator = Cc['@mozilla.org/appshell/window-mediator;1'].getService(Ci.nsIWindowMediator);
  winMediator.removeListener(mediatorListener);
}

function install(data, reason) {
  // upsell? product tour? other first time experience?
  // TODO: xhr the install event to a server
}

function uninstall(data, reason) {
  // uninstall / offboarding experience? ask for feedback?
  // TODO: xhr the uninstall event to a server
}
