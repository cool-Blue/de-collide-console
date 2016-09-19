/**
 * Created by cool.blue on 17-Sep-16.
 */
var strmWrite,
    EOL = require('os').EOL;
var socketWrite = require('net').Socket.prototype.write;
var consoleWarn = socketWrite.bind(process.stderr);

var consoleMUX = exports;

var queue = {};

consoleMUX.init = function (t) {

  /**
   * <h3>deQ</h3>
   * execute the provided write after delay t
   * @param chunk {string|buffer}
   * @param enc {string}
   * @param write {Stream.Writable.write}
   * @returns {Promise} promise to write
   */
  queue.deQ = function deQ(chunk, enc, write) {
    enc = typeof enc === 'undefined' ? 'utf8' : enc;
    return new Promise((res) => {
      setTimeout(_ => write(chunk, enc, res), t);
    })
  };

  queue.tail = Promise.resolve();

  var enQ = function (strm, q) {
    // todo figure out how to detect when the queue is done

    var _write = strm.write;
    if(strm.write !== socketWrite) {
      if(strm.write.length < 3) {
        consoleWarn('Warning: un-registered write method on socket (fd'
        + strm.fd + '), no callbacks will be executed!'+EOL);
/*
        if write does not execute cb, promise chain will not resolve.
        Defensively proxy the queue callback
*/
        strmWrite = function (chunk, enc, cb) {
          _write.apply(strm, arguments);
          cb()
        }
      } else {
        consoleWarn('Warning: un-registered write method on socket (fd'
        + strm.fd + '), ensure arg[2] is treated as a callback!'+EOL);
        strmWrite = _write.bind(strm);
      }
    } else {
      strmWrite = _write.bind(strm);
    }

    /**
     * <h3>_enQ</h3>
     * Proxy for stream.write that redirects to a queue
     * @param chunk {string | buffer}
     * @param enc {string}
     * @param done  {function}
     */
    function _enQ (chunk, enc, done) {
      q.tail = q.tail.then(_ =>
        q.deQ(chunk, enc, strmWrite)
          .then(e => { if(typeof done === 'function') done(e) })
      )
    }

    strm.write = _enQ;
    _enQ.unhook = _ => strm.write = _write;

    return enQ;

  };
  enQ(process.stdout, queue)(process.stderr, queue);

  return _ => {
    process.stderr.write.unhook();
    process.stdout.write.unhook();
  }

};

