/**
 * Created by cool.blue on 17-Sep-16.
 *
 */
'use strict';
const EventEmitter = require('events');
const util = require('util');

var log;

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

var errors = {
  InstantiationError,
  WriteTimeoutError
};

/**
 * <h3>Multiplex stdout and stderr into a shift register</h3>
 * @constructor
 * @event drain
 * @argument t {number}
 */
module.exports = (function () {

  /**
   * Private static fields
   **/

  var Queue = (function () {
    var _m = [];
    /**
     * This object manages an array to mirror the promise queue
     * and to provide a drain event
     * @class Queue
     * @param skip
     */
    return class state extends EventEmitter {
      /**
       * @constructor
       * @param skip - skip errors if truthy
       */
      constructor(skip) {
        super();
        this.skipErrors = skip;
        this.thrown = false;
      }

      /**
       * record a reference to the next queue member
       * @public
       * @param _
       * @returns {Number}
       */
      static push(_) {
        log.write(`push ${_}`);
        return _m.push(_);
      }

      /**
       * consume the oldest queue member
       * @public
       * @emits drain
       * @returns {*}
       */
      pop(source) {
        var r = _m.shift();
        log.write(`popped ${r} ${util.inspect(source)}\n${util.inspect(_m)}`);
        if ( !_m.length ){
          process.nextTick(() => {
            log.write(`state: emitting drain ${r} ${util.inspect(source)} ${util.inspect(_m)}`);
            source.source += "::pop";
            this.emit('drain', r, source)
          });
        }
        return r
      }
      static length () {
        return _m.length;
      }
      static values () {
        return _m;
      }
      abort (e) {
        this.thrown = e;
      }
    }
  })();

  var _ee;

  var _tail;
  var _queueMembers;
  var _t;

  var _timeout = 1000;

  /**
   * Private static methods
   **/

  /**
   * delay element for padding the promise queue
   * resolves after the specified time or rejects immediately on error
   * @param t
   * @returns {Promise}
   * @private
   */
  function _delay(t) {
    return new Promise((res, rej) => {
      var e;
      if ( e = _queueMembers.thrown )
        rej(e);
      else
        setTimeout(res, t)
    })
  }

  /**
   * <h3>insert a shift register in strm.write, with fixed gaps between writes</h3>
   * @private
   * @param {Socket} strm
   * @returns {_hook}
   */
  function _hook (strm) {

      /**
       * store the write method to be proxy'ed, but only once!
       * this is closed over by
       * @private {function}
       */
      var _write = strm.write;
      if ( _write.name === __enQ.name )
        throw( new InstantiationError(
          `${{"1": "stdout", "2": "stderr"}[strm.fd]} is already hooked.`
        ));

      /**
       * proxy the stream write method with standard signature
       */

      /**
       * Return a function that will resolve the promise after writing
       * and maintain a watchdog timer that throws if the queue hangs
       * Handle different possible call signatures for the write function
       * @param chunk {string | buffer}
       * @param enc {string}
       * @param done  {function}
       * @returns {Promise}
       */
      function promiseToWrite(chunk, enc, done) {
        var dog;
        return new Promise((res, rej) => {

          dog = setTimeout(
            rej.bind(null, new WriteTimeoutError(`write timeout ${chunk}`)),
            _timeout
          );

          if ( typeof enc === 'function' )               // write(chunk, done)
            _write.call(strm, chunk, () => {
              enc(chunk);
              res(chunk)
            });
          else if ( typeof done === 'function' )         // write(chunk, enc, done)
            _write.call(strm, chunk, enc, () => {
              done(chunk);
              res(chunk)
            });
          else {
            _write.call(strm, chunk, enc, done);      // unknown signature, assume sync
            res(chunk)
          }
        }).then((chunk) => {
          clearTimeout(dog);
          return chunk
        });             // timeout error will skip this
      }

      /**
       * push a promise to write into the shift register
       * @private
       * @fires drain
       * @param chunk {string | buffer}
       * @param enc {string}
       * @param done  {function}
       */
      function __enQ(chunk, enc, done) {

        _tail = _tail
          .then(() => _delay(_t))                      // can throw stream error
          .then(() =>
            promiseToWrite(chunk, enc, done)           // can throw timeout error
              .then(
                (chunk) =>
                  _queueMembers.pop({source: "resolved", value: chunk})
              )
          )                                           // catch errors thrown by
          .catch(e => {                               // delay and promiseToWrite
            this.__unhook();
            _queueMembers.pop({source: "reject", value: e});
            _ee.emit('error', e, chunk)
          });
        Queue.push(chunk);                            // mirror the value in the queue
      }

      strm.write = __enQ;
      strm.__unhook = () => strm.write = _write;

      if ( typeof strm.on === 'undefined' ) {
        let ee = new EventEmitter();
        strm.on = (e, l) => ee.on.call(strm, e, l);
        strm.emit = (type, e) => ee.emit.call(strm, type, e);
      }
      strm.on('error', e => {
        _queueMembers.abort(e)
      });

      return _hook;

    }

  /**
   * Class with exclusively static methods and private, static state.
   * There is no instance state or behaviour.
   * Marshals stdout and stderr streams to ensure that they are emitted
   * in the order that they arrive.
   */
  return class DeCollide {

    constructor (t, logFile) {

      _ee = new EventEmitter();

      log = logFile || {write: () => {}};

      _queueMembers = new Queue();
      _tail = Promise.resolve();

      /**
       * shift out delay
       * @type {number}
       * @private
       */
      _t = typeof t === 'undefined' ? 100 : t;

      // pass the drain event on to the consumer un-handled
      _queueMembers.on('drain', (v, s) => {
        log.write(`DeCollide: emitting drain ${v} ${util.inspect(s)}`);
        s.source += "::_queueMembers.onDrain";
        process.nextTick(() => DeCollide.emit('drain', v, util.inspect(s)));
      });

      // bind stdout and stderr
      _hook(process.stdout)(process.stderr);

    }

    /**
     * Public static interface
     */

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
      process.stdout.__unhook();
      process.stderr.__unhook();
    };
    // expose queue state
    static Length () { return Queue.length };
    static tail () { return _tail };
    static writing (){ return !!Queue.length };
    static _values () { return Queue.values() };
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