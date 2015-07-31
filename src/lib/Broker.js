'use strict';

// global pubsub object
// - one per browser window
// - used for inter-module communication
// - stores listeners in arrays, so it could leak memory
// - throws when common errors occur:
//   - check types of event and callback on subscribe, unsubscribe
//   - check type of event on publish
//   - throw on attempt to publish an unknown event
//
// Naming conventions:
//   Event names are a double colon-separated object name, object event name pair
//   For example: "popup::popupOpen", "urlbar::navigationalKey"
//   Exception: the old iframe API event names are dashed, so the corresponding
//   "iframe::" events are, too: "iframe::url-selected". TODO: unify.

let Broker; // eslint-disable-line no-unused-vars

Broker = {
  _subscribers: {},
  _isValidEvent: function(evt) {
    return evt && typeof evt === 'string';
  },
  _isValidCallback: function(cb) {
    return cb && typeof cb === 'function';
  },
  _eventExists: function(evt) {
    return evt in this._subscribers;
  },
  subscribe: function(evt, cb, thisArg) {
    if (!this._isValidEvent(evt)) {
      throw new TypeError('called subscribe with invalid event name ' + evt);
    }
    if (!this._isValidCallback(cb)) {
      throw new TypeError('called subscribe with an invalid callback ' + cb);
    }
    if (!this._eventExists(evt)) {
      this._subscribers[evt] = [];
    }

    let exists;
    this._subscribers[evt].forEach(function(subscriber) {
      if (subscriber.cb === cb && subscriber.thisArg === thisArg) {
        exists = true;
      }
    });
    if (exists) { return; }

    this._subscribers[evt].push({ cb: cb, thisArg: thisArg });
  },
  unsubscribe: function(evt, cb, thisArg) {
    if (!this._isValidEvent(evt)) {
      throw new TypeError('called unsubscribe with invalid event name ' + evt);
    }
    if (!this._isValidCallback(cb)) {
      throw new TypeError('called unsubscribe with an invalid callback ' + cb);
    }
    if (!this._eventExists(evt)) {
      throw new TypeError('called unsubscribe for unknown event ' + evt);
    }

    this._subscribers[evt].forEach(function(subscribed, i) {
      if (subscribed.cb === cb && subscribed.thisArg === thisArg) {
        this._subscribers[evt].splice(i, 1);
      }
    });
  },
  // first argument: name of the signal
  //
  // the first arg is stripped off, and the remaining arguments will be passed
  // to subscribers
  publish: function() {
    const evt = arguments[0];
    const args = Array.prototype.slice.call(arguments, 1);
    if (!this._isValidEvent(evt)) {
      throw new TypeError('called publish with invalid event name ' + evt);
    }

    this._subscribers[evt].forEach(function(subscriber) {
      subscriber.cb.apply(subscriber.thisArg, args);
    });
  }
};
