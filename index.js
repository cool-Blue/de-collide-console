/**
 * Copyright (c) 2016 cool.blue@y7mail.com
 * Created by cool.blue on 17-Sep-16.
 */
'use strict';
const EventEmitter = require('events');
const util = require('util');


var errors = (function () {

  class InstantiationError extends Error {
    constructor (message) {
      super(message);
    }
  }

  class WriteTimeoutError extends Error {
    constructor (message) {
      super(message);
    }
  }

  class StreamError extends Error {
    constructor (message) {
      super(message);
    }
  }

  return {
    InstantiationError,
    WriteTimeoutError,
    StreamError
  }

})();

var log = {write: _ => _};

/**
 * Marshal hooked streams into a clocked stream with strictly preserved
 * chronology.
 */
module.exports = (function () {

  /****************************************************************************
   * Private static fields
   ****************************************************************************/

  var /** State */ _Queue = (function () {

    /**************************************************************************
     * Private static members
     **************************************************************************/

    var /** (string|buffer)[] */ _m = [];
    var /** Object[] */ _errors = [];

    function _thrown () {
      return !!_errors.length && _errors[_errors.length -1];
    }

    /**
     * Manages an array to mirror the promise queue
     * @emit drain
     */
    return class State extends EventEmitter {

      constructor(options) {
        options = options || {};
        super();
        this.skipErrors = !!options.skip;
        _errors = [];
      }

      // consume the oldest queue member and emit drain events
      // log errors
      pop(e) {
        var r = _m.shift();
        if ( e )
          _errors.push({at: _m.length, value: r, error: e, thrown: false});
        if ( !_m.length ){
          process.nextTick( () => {
            log.write(`emit drain ${r} ${util.inspect(_m)}`);
            this.emit('drain', _errors, r)
          } );
        }
        return r
      }
      skip () {
        var e;
        if (e = _thrown()) {
          log.write(`_delay : thrown ${util.inspect(e)}`);
          if (!e.thrown) {
            e.thrown = true;
          }
          return !this.skipErrors
        }
        return false;
      }
      error (e) {
        _errors.push({at: _m.length, error: e, thrown: false})
      }

      // record a reference to the next queue member
      static push(_) {
        return _m.push(_);
      }

      static length () {
        return _m.length;
      }
      static values () {
        return _m;
      }
    }
  })();

  // Exposed on the public static interface to provide a static event emitter
  var /** EventEmitter */ _ee;

  /** Promise chain management */

  // called by the last promise in the chain
  var /** Promise */ _tail;
  // mirrors the state of the promise chain
  var /** State */ _queueState;
  // sets the delay between writes to stdout and stderr
  var /** number */ _t;

  var _timeout = 1000;

  /****************************************************************************
   * Private static methods
   ****************************************************************************/

  /**
   * delay element for padding and organising the promise queue
   * resolves after the specified time or rejects immediately on error
   * if an error occurs during the wait time, reject after time-out
   */
  function _delay(/** number */ t) {
    return new Promise( (res, rej) => {
      if ( _queueState.skip() )
        rej();
      log.write(`_delay : NOT thrown ${t}`);
      setTimeout(() => {
        if (_queueState.skip())
          rej();
        else
          res()
      }, t)
    })
  }

  /**
   * Buffer all hooked streams into a queue and emit the writes as a regularly
   * spaced sequence, strictly preserving the original order.
   */

  function _hook (/** Socket */ strm) {

    /**
     * store the write method to be proxy'ed, but only once!
     * this is closed over by
     */
    var _write = strm.write;
    if ( _write.name === __enQ.name )
      throw( new errors.InstantiationError(
        `${{"1": "stdout", "2": "stderr"}[strm.fd]} is already hooked.`
      ));

    // Proxy the stream write method with standard signatures

    /**
     * Return a function that will resolve the promise after writing
     * and maintain a watchdog timer that throws if the queue hangs
     * Handle different possible call signatures for the write function
     */
    function promiseToWrite(chunk, enc, done) {
      var /** long */ dog;
      return new Promise((res, rej) => {

        log.write(`promiseToWrite ${chunk}
                    enc: ${util.inspect(enc)}
                    done: ${util.inspect(done)}
                    timeout: ${_timeout}`);

        dog = setTimeout(
          rej.bind(null, new errors.WriteTimeoutError(`write timeout ${chunk}`)),
          _timeout
        );

        if (typeof enc === 'function')               // write(chunk, done)
          _write.call(strm, chunk, () => {
            log.write(`_write ${chunk}`);
            enc(chunk);
            res(chunk)
          });
        else if (typeof done === 'function')         // write(chunk, enc, done)
          _write.call(strm, chunk, enc, () => {
            log.write(`_write ${chunk}`);
            done(chunk);
            res(chunk)
          });
        else {
          _write.call(strm, chunk, enc, done);        // unknown signature, assume sync
          res(chunk)
        }
      }).then((chunk) => {
        clearTimeout(dog);
        log.write(`promiseToWrite clear ${chunk}`);
        return chunk
      });                                             // timeout error will skip this
    }

    var onError = e => {
      log.write(`stream error ${util.inspect(e)}`);
      _ee.emit('error', e);
      _queueState.error(e)
    };
    
    // shim brout a little closer to node in the browser
    if ( typeof strm.on === 'undefined' ) {
      let ee = new EventEmitter();
      strm.on = (e, l) => ee.on.call(strm, e, l);
      strm.emit = (type, e) => ee.emit.call(strm, type, e);
      strm.removeListener = (type, l) => ee.removeListener.call(strm, type, l);
    }
    strm.on('error', onError);

    /**
     * push a promise to write into the queue
     */
    function __enQ(chunk, enc, done) {

      _tail = _tail
        .then(() => _delay(_t))                      // can throw stream error
        .then(() =>
          promiseToWrite(chunk, enc, done)           // can throw timeout error
            .then(
              (chunk) =>
                _queueState.pop()
            )
        )                                            // catch errors thrown by
        .catch(e => {                                // delay and promiseToWrite
          log.write(`catch ${e}`);
          _queueState.pop(e);
          if (e instanceof errors.WriteTimeoutError) _ee.emit('error', e, chunk);
        });
      _Queue.push(chunk);                            // mirror the value in the queue
    }

    __enQ.__unhook = () => {
      strm.write = _write;
      strm.removeListener('error', onError)
    };
    strm.write = __enQ;

    return _hook;

  }

  /**
   * Class with exclusively static methods and private, static state.
   * There is no instance state or behaviour.
   * Marshals stdout and stderr streams to ensure that they are emitted
   * in the order that they arrive.
   */
  return class DeCollide {

    constructor (options) {

      options = options || {};

      log = options.logger || log;

      _timeout = options.timeout || _timeout;

      _ee = new EventEmitter();

      _queueState = new _Queue({skip: !!options.skip});
      _tail = Promise.resolve();

      // shift out delay
      _t = typeof options.t === 'undefined' ? 100 : options.t;

      // pass the drain event on to the consumer un-handled
      _queueState.on('drain', (e, v) => {
        process.nextTick(() => DeCollide.emit('drain', e, v));
      });

      // hook stdout and stderr
      _hook(process.stdout)(process.stderr);

    }

    /****************************************************************************
     * Public static interface
     ****************************************************************************/

    // expose a static event emitter by binding to a private member
    static on() {
      var args = Array.prototype.slice.apply(arguments);
      return _ee.on.apply(_ee, args);
    }
    static emit() {
      var args = Array.prototype.slice.apply(arguments);
      return _ee.emit.apply(_ee, args);
    }
    // un-bind
    static unhook() {
      process.stdout.write.__unhook && process.stdout.write.__unhook();
      process.stderr.write.__unhook && process.stderr.write.__unhook();
    };
    // expose queue state
    static Length () { return _Queue.length };
    static tail () { return _tail };
    static writing (){ return !!_Queue.length };
    static _values () { return _Queue.values() };
    // accessor for write timeout
    static timeout(t) {
      if ( !(typeof t === 'undefined' ))
        _timeout = t;
      else
        return _timeout;
    };
  }

})();

if ( process.env.NODE_ENV === 'test' ) {
  module.exports.errors = errors;
}