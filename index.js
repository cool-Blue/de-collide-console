/**
 * Created by cool.blue on 17-Sep-16.
 */

var consoleMUX = exports;

const EOF = require('os');
var queue = Promise.resolve();

consoleMUX.init = function (t) {
  var writeStderr = process.stderr.write;
  var writeStdout = process.stdout.write;
  var writeErr = writeStderr.bind(process.stderr);
  var writeOut = writeStdout.bind(process.stdout);

  function deQ(txt, write, enc) {
    enc = typeof enc === 'undefined' ? 'utf8' : enc;
    return new Promise((res, rej) => {
      setTimeout(_ => write(txt, enc, res), t);
    })
  }

  process.stderr.write = function(chunk, enc, done) {
    queue = queue.then(_ =>
      deQ(chunk, writeErr, enc)
        .then(_ => { if(typeof done === 'function') done() })
    )
  };

  process.stdout.write = function(chunk, enc, done) {
    queue = queue.then(_ =>
      deQ(chunk, writeOut, enc)
        .then(_ => { if(typeof done === 'function') done() })
    )
  };

  return function unHook() {
    process.stderr.write = writeStderr;
    process.stdout.write = writeStdout;
  }
};