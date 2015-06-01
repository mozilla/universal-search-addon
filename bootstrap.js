
'use strict';

// TODO require is undefined?
//var {Cc, Ci, Cu} = require("chrome");
//Cu.import("resource://gre/modules/Services.jsm");
//Cu.import("resource://gre/modules/WebChannel.jsm");

function install() {
  console.log('installing');
}
function uninstall() {
  console.log('uninstalling');
}
function startup(data, reason) {
  console.log('starting up');
}
function shutdown(data, reason) {
  console.log('shutting down');
}
