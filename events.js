/**
 * Created by cool.blue on 22-Oct-16.
 */
'use strict';
const EventEmitter = require('events');

var _m = [];
class mirrorState extends EventEmitter {

  constructor(skip) {
    super();
    this.thrown = false;
  }

  static push (x) {
    return _m.push(x)
  }
  pop (popper) {
    var r = _m.shift();
    if(!_m.length){
      process.nextTick(() => {
        this.emit('drain', r, popper)
      });
    }
    return r
  }
  abort (e) {
    this.thrown = e;
  }
}
module.exports = (function(){

  var _self;

  var _tail = Promise.resolve();
  var _q = new mirrorState();
  var _t;

  var _push;
  var _subject = [];

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
      if(e = _q.thrown)
        rej(e);
      else
        setTimeout(res, t)
    })
  }

  function _hook (a) {

    _subject = a;
    _push = a.push;

    function promiseToPop () {
      return new Promise((res, rej) => {
          setTimeout(() => {
            try {
              var v = _subject.shift();
              console.log(`popped ${v}`);
              res(v);
            } catch (e) {
              rej(e);
            }
          }, _t);
        }
      )
    }
    function __enQ(x) {

      console.log(`pushing ${x}`);

      _push.call(_subject, x);
      _tail = _tail
        .then(() => _delay(_t))                      // can throw stream error
        .then(() =>
          promiseToPop()            // can throw timeout error
            .then(
              (v) => {
                _q.pop({source: "auto", value: v});
              })
        )                                           // catch errors thrown by
        .catch(e => {                               // delay and promiseToWrite
          _subject.__unhook();
          _q.pop({source: "reject", value: e});
          _self.emit('error', e, x)
        });
      return mirrorState.push(x)
    }

    a.push = __enQ;
    a.__unhook = () => {
      _subject.push = _push;
      delete _subject.pop;
    };
  }

  return class Wrapper extends EventEmitter {

    constructor(queue, t) {

      super();
      _self = this;

      _t = typeof t === 'undefined' ? 100 : t;

      _q.on('drain', (v, s) => process.nextTick(_self.emit('drain', v, s)));

      _hook(queue);  // hook a global array

    }
    static unhook () {
      // _subject.push = _push;
      delete _subject.push;
      delete _subject.pop;
    }
    static get length () {return _subject.length};
  }

})();