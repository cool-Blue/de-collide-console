/**
 * Created by cool.blue on 17-Sep-16.
 */
'use strict';
const EventEmitter = require('events');
const util = require('util');

var Queue = (function () {
  var _m = [];
  /**
   * @class Queue
   * @param skip
   */
  return class extends require('events') {
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
    push(_) {
      return _m.push(_);
    }

    /**
     * consume the oldest queue member
     * @public
     * @emits drain
     * @returns {*}
     */
    pop() {
      var r = _m.shift();
      if(!_m.length)
        process.nextTick(() => this.emit('drain'));
      return r
    }
    length () {
      return _m.length;
    }
    values () {
      return _m;
    }
    abort (e) {
      this.thrown = e;
    }
  }
})();


/**
 * <h3>Multiplex stdout and stderr into a shift register</h3>
 * @constructor
 * @event drain
 * @argument t {number}
 */
module.exports = (function () {

  function ConsoleMUX (t) {

    var self = this;

    if(!(this instanceof ConsoleMUX))
      return new ConsoleMUX(t);

    EventEmitter.call(this);

    var tail = Promise.resolve();
    var queueMembers = new Queue();

    var _timeout = 1000;

    /**
     * shift out delay
     * @type {number}
     * @private
     */
    t = typeof t === 'undefined' ? 100 : t;
    queueMembers.on('drain', _ => setTimeout(() => self.emit('drain'), t));

    function delay(t) {
      return new Promise((res, rej) => {
        var e;
        if(e = queueMembers.thrown)
          rej(e);
        else
         setTimeout(res, t)
      })
    }

    /**
     * <h3>insert a shift register in strm.write, with fixed gaps between writes</h3>
     * @private
     * @param {Socket} strm
     * @returns {enQ}
     */
    var enQ = function(strm) {

      /**
       * proxy the stream write method with standard signature
       */

      /**
       * the write method to be proxy'ed
       * @private {function}
       */
      var _write = strm.write;

      /**
       * <h3>return a function that will resolve the promise after writing
       * @param chunk {string | buffer}
       * @param enc {string}
       * @param done  {function}
       * @returns {Promise}
       */
      function proxyWrite(chunk, enc, done) {
        var dog;
        return new Promise((res, rej) => {

          dog = setTimeout(rej.bind(null, new Error(`write timeout ${chunk}`)), _timeout);

          if(typeof enc === 'function')             // write(chunk, done)
            _write.call(strm, chunk, _ => {
              enc(_);
              res()
            });
          else if(typeof done === 'function')       // write(chunk, enc, done)
            _write.call(strm, chunk, enc, _ => {
              done(_);
              res()
            });
          else {
            _write.call(strm, chunk, enc, done);    // unknown signature, assume sync
            res()
          }
        }).then(() => clearTimeout(dog));           // timeout error will skip this
      }

      /**
       * <h3>push a promise to write into the shift register</h3>
       * @private
       * @fires drain
       * @param chunk {string | buffer}
       * @param enc {string}
       * @param done  {function}
       */
      function _enQ(chunk, enc, done) {

        tail = tail
          .then(() => delay(t))             // can throw stream error
          .then(
            () =>
            proxyWrite(chunk, enc, done)    // can throw timeout error
              .then(
                () => {
                  queueMembers.pop();
                })
          )                                 // catch errors thrown by
          .catch(e => {                     // delay and proxyWrite
            strm.__unhook();
            self.emit('error', e, chunk)
          });
        queueMembers.push(chunk);
      }

      strm.write = _enQ;
      strm.__unhook = _ => strm.write = _write;
      strm.on('error', e => {
        queueMembers.abort(e)
      });

      return enQ;

    };

    enQ(process.stdout)(process.stderr);

    this.unhook = () => {
      process.stdout.__unhook();
      process.stderr.__unhook();
    };
    this.qLength = _ => queueMembers.length;
    this.writing = () => !!queueMembers.length;
    this._values = () => queueMembers.values();
    this.timeout = (t) => {
      if(!(typeof t === 'undefined'))
        _timeout = t;
      else
        return _timeout;
    };

  }
  util.inherits(ConsoleMUX, EventEmitter);
  return ConsoleMUX;
})();