/**
 * Created by cool.blue on 18-Sep-16.
 */
'use strict';
const chai = require('chai');
const expect = chai.expect;
var Decollide = require('../');
const fs = require('fs');
const path = require('path');
const util = require('util');

var log = (function(wrapperSelector) {
  var _basePath = path.normalize(__dirname + '\\..');
  var _traceFlag = false;

  function _header (message) {
  return `\n*********************************************************************************************\n${message}\n*********************************************************************************************\n`;
}

  function _trace (basePath) {
    try {
      throw new Error();
    } catch (e) {
      var stack = e.stack;
      if (stack) {
        return stack.split('\n').filter(l =>
            l.includes(basePath) && !l.includes("node_modules")
          ).slice(2)
            .map(l => l.replace(basePath, ""))
            .join("\n") + "\n";
      }
    }
  }

  function _accessTraceFlag (f) {
    if ( typeof f === 'undefined' )
      return _traceFlag;
    else{
      _traceFlag = f;
      return this
    }
  }

  function _trim(m) {
    return m.replace(/\n$/, "") + "\n";
  }

  if (typeof document === 'undefined') {
    var logStream = fs.createWriteStream('log.txt');
    return {
      write: (message) =>
        logStream.write(`${_trim(message)}${_traceFlag ? _trim(_trace(_basePath)) :""}`),
      header: function (message) {
        this.write(`${_header(message)}`)
        return this;
      },
      trace: _accessTraceFlag
    }
  }
  else {
    var logDiv = document.createElement('div');

    logDiv = document.querySelector(wrapperSelector).appendChild(logDiv);
    logDiv.outerHTML =
      `<div id="log-wrapper" style= "margin: 10px; cursor: pointer;">
            <h1>Log Output</h1>
            <div id="log-panel" style="white-space: pre; display: none; overflow: scroll; height: 400px"><h2 id="log" "></h2></div>
        </div>`;
    logDiv = document.querySelector('#log');
    var logPanel = document.querySelector('#log-panel');
    var h = document.querySelector('#log-wrapper h1');

    h.addEventListener('click', e =>
      logPanel.style.display = logPanel.style.display === 'none' ? 'block' : 'none'
    );
    logPanel.addEventListener('click', e =>
      logPanel.style.display = logPanel.style.display === 'none' ? 'block' : 'none'
    );

    return {
      write: (message) =>
        logDiv.textContent += `${_trim(message)}${_trim(_traceFlag ? _trace("") : "")}`,
      header: function (message) {
        this.write(`${_header(message)}`);
        return this;
      },
      trace: _accessTraceFlag
    }
  }
})('#mocha');

var delay = 100;

var hooks = (function() {
  var hstderr, hstdout;
  function save () {
    hstderr = process.stderr.write;
    hstdout = process.stdout.write;
  }
  function restore () {
    process.stderr.write = hstderr;
    process.stdout.write = hstdout;
  }
  return { save, restore }
})();

/**
 * Isomorphic constructor for a timer to return
 * the elapsed time between calls in ms
 */
function Elapsed () {

  var msecNow = process && process.hrtime
    ? () => process.hrtime().reduce((ms, t, i) => ms += i ? t * 1e-6 : t * 1e3, 0)
    : () => performance.now();

  var t0 = msecNow();

  return () => {
    var dt = msecNow() - t0;
    t0 = msecNow();
    return dt.toPrecision(7)
  }
}

describe('deMUX', function () {
  function errorHarness(dcOptions, writeOptions, onError, output, done) {
    var lines = [];
    var errorCalback;

    process.stderr.write = function (line, cb) {
      if (line === writeOptions.throwOn) {
        writeOptions.onThrown(cb);
      }
      else {
        log.write(`proxy write: ${line}`);
        lines.push(line);
        cb();
      }
    };

    new Decollide(dcOptions);

    Decollide.on('error', errorCalback = onError(lines));

    Decollide.on('drain', (e, v) => {

      Decollide.unhook();

      hooks.restore();

      log.write(`drain listener: last value: ${v}\terrors: ${util.inspect(e)}\noutput: ${util.inspect(lines)}`);

      expect(lines).to.eql(output);
      expect(Decollide._values().length).to.eql(0);

      done();
    })
  }

  beforeEach(function () {
    hooks.save();
    Decollide = require('../');
  });
  afterEach(function () {
    hooks.restore();
  });

  this.timeout(5000);

  it('should throw if hooked again', function () {

    new Decollide(delay);
    expect(() => new Decollide(delay)).to.throw(Decollide.errors.InstantiationError)

  });
  it('should restore standard writes', function (done) {

    log.header(`${this.test.title}`);
    var writes = [];
    var writeHooks = [];
    var lines = [];
    var toSend = {log: 'log-log', err: 'log-error'};

    // hook stdout and stderr
    // store their original write methods in writes[]
    // and redirect writes to push lines[]
    // store the redirect methods in writeHooks[]
    var _writeHook = (_) => {
      lines.push(_.replace(/\n$/, ""));
    };
    // var _writeHook = WriteHook(lines);
    ['stdout', 'stderr'].forEach(chanel => {
      writes.push(process[chanel].write);
      process[chanel].write = _writeHook;
      writeHooks.push(process[chanel].write)
    });

    // establish the regulated queue on both channels, write
    // to them and listen for the drain events
    new Decollide({t: delay});
    console.log(toSend.log);
    console.error(toSend.err);
    Decollide.on('drain', function (e, v) {
      // restore the test hooks
      Decollide.unhook();
      var outWrite = process.stdout.write;
      var errWrite = process.stderr.write;

      // resume normal transmission
      hooks.restore();

      log.write(`drain listener: last value: ${v}\terrors: ${util.inspect(e)}\noutput: ${util.inspect(lines)}`);

      // confirm that the hooks worked
      expect(lines[0]).to.equal(toSend.log);
      expect(lines[1]).to.equal(toSend.err);
      // check that the test hooks were restored
      expect(outWrite).to.equal(_writeHook);
      expect(errWrite).to.equal(_writeHook);
      done();
    });

  });
  it('should preserve the order of output and step with delay', function (done) {

    log.header(`${this.test.title}`);

    // make an array of messages tagged with alternating log and error prefixes
    var lines = [];
    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(_ => {
      lines.push('log:' + _);
      lines.push('error:' + _)
    });

    // returns a state machine that will yield the next value of the outputs
    // array and the elapsed time since the previous call.
    // it will complete when called with writing === falsey
    function* checkSeq(outputs, writing) {

      var elapsedTime = Elapsed();

      var i = 0, line;
      line = yield;
      while (writing()) {
        line = yield {line: outputs[i], dt: elapsedTime(), i: i++}
      }

    }

    // test hooks to receive the marshaled messages
    // get the next message in the
    process.stdout.write = process.stderr.write = function (line) {
      var state = seq.next(line);
      log.trace(false).write(util.inspect(state).replace('\n', ''));
      if (state.done) return;
      expect(line).to.equal(state.value.line + '\n');
      if (  state.value.i ) {
        expect(state.value.dt).to.be.within(0.9 * delay, 1.5 * delay);
      }
    };

    new Decollide({t: delay, skip: false});

    // set an error listener for the queue
    Decollide.on('error', (e, _) => {
      process.stdout.write(`${e}\t${_}`)
    });

    var seq = checkSeq(lines, Decollide.writing.bind(Decollide));

    seq.next();

    // write to console.log and console.error depending on the message prefix
    lines.forEach((_) => {
      console[_.substring(0, _.indexOf(':'))](_);  // decode and write too
    });
    Decollide.on('drain', function (e, v) {
      Decollide.unhook();
      hooks.restore();

      log.write(`drain listener: last value: ${v}\terrors: ${util.inspect(e)}\noutput: ${util.inspect(lines)}`);

      if (e && e instanceof Error) throw(e);
      done();
    });

  });
  it('should honour callback for two arg signature', function (done) {

    log.header(`${this.test.title}`);

    var lines = [];
    var _writeHook = (_, cb) => {
      lines.push(_);
      cb()
    };
    ['stdout', 'stderr'].forEach(chanel => {
      process[chanel].write = _writeHook;
    });

    var cb = (function () {
      var calls = 0;
      var f = function (chunk) {
        log.trace(false).write(chunk);
        return calls++
      };
      f.calls = function () {
        return calls
      };
      return f;
    })();
    new Decollide({t: 1000});
    var cbCount;
    Decollide.on('drain', function (e, v) {
      
      Decollide.unhook();
      hooks.restore();

      log.write(`drain listener: last value: ${v}\terrors: ${util.inspect(e)}\noutput: ${util.inspect(lines)}`);

      expect((cbCount = cb.calls())).to.equal(2);

      done();
    });
    process.stdout.write('stdout\n', cb);
    process.stderr.write('stderr\n', cb);

  });
  it('should honour callback for three arg signature', function (done) {

    log.header(`${this.test.title}`);

    var lines = [];
    var _writeHook = (_, enc, cb) => {
      lines.push(_);
      cb()
    };
    ['stdout', 'stderr'].forEach(chanel => {
      process[chanel].write = _writeHook;
    });

    var cb = (function () {
      var calls = 0;
      var f = function (chunk) {
        return calls++
      };
      f.calls = function () {
        return calls
      };
      return f;
    })();

    new Decollide({t: 1000});
    var cbCount;
    Decollide.on('drain', function (e, v) {

      Decollide.unhook();

      hooks.restore();

      log.write(`drain listener: last value: ${v}\terrors: ${util.inspect(e)}\noutput: ${util.inspect(lines)}`);

      expect((cbCount = cb.calls())).to.equal(2);

      done();
    });
    process.stdout.write('stdout\n', 'utf8', cb);
    process.stderr.write('stderr\n', 'utf8', cb);

  });
  it('should throw on write timeout', function (done) {
    process.stderr.write = function (line) {
      console.log(line)
    };

    log.header(`${this.test.title}`);

    new Decollide({t: 100});
    Decollide.timeout(0);
    process.stderr.write('should throw', _ => _);
    Decollide.on('error', function (e, v) {
      Decollide.unhook();

      hooks.restore();

      log.write(v);

      expect(e).to.be.an.instanceof(Decollide.errors.WriteTimeoutError);

      // done();
    });
    Decollide.on('drain', (e, v) => {

      Decollide.unhook();

      hooks.restore();

      log.write(`drain listener: last value: ${v}\terrors: ${util.inspect(e)}`);

      done();
    })

  });
  it('should emit write timeout error then continue if skip === true and not leak memory', function (done) {

    log.header(`${this.test.title}`);

    errorHarness({t: 100, timeout: 100, skip: true/*, logger: log*/},
      {throwOn: "log:5", onThrown: cb => setTimeout(cb, 1000)},
      () => {
        return function (e, v) {
          log.write(`${v}\t${e.message}`);
        }
      },
      [1, 2, 3, 4, 6, 7, 8, 9].map(_ => 'log:' + _),
      done);

    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(_ => {
      process.stderr.write('log:' + _, _ => _);
    });

  });
  it('should emit write timeout error then abort if skip === false and not leak memory', function (done) {

    log.header(`${this.test.title}`)//.trace(true);

    errorHarness({t: 100, timeout: 100, skip: false/*, logger: log*/},
      {throwOn: "log:5", onThrown: cb => setTimeout(cb, 1000)},
      () => {
        return function (e, v) {
          log.write(`${v}\t${e.message}`);
        }
      },
      [1, 2, 3, 4].map(_ => 'log:' + _),
      done);

    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(_ => {
      process.stderr.write('log:' + _, _ => _);
    });

  });
  it('should throw on stream errors when skip === false and not leak memory', function (done) {

    log.header(`${this.test.title}`)/*.trace(true)*/;

    errorHarness(
      {t: 500, skip: false/*, logger: log*/}, {},
      function (lines) {
        return function (e) {

        Decollide.unhook();

        hooks.restore();

        log.write(`error listener ${util.inspect(e)}\n${util.inspect(lines)}`);

        expect(e.message).to.equal('test error');

      }},
      ['log:1', 'log:2', 'log:3', 'log:4', 'log:5'],
      done);

    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(_ => {
      process.stderr.write('log:' + _, _ => _);
    });

    setTimeout(() => {
      process.stderr.emit('error', new Error('test error'));
    }, 3000);

  });
  it('should throw on stream errors when skip === true and not leak memory', function (done) {

    log.header(`${this.test.title}`)/*.trace(true)*/;

    errorHarness(
      {t: 500, skip: true/*, logger: log*/}, {},
      function (lines) {
        return function (e) {

          Decollide.unhook();

          hooks.restore();

          log.write(`error listener ${util.inspect(e)}\n${util.inspect(lines)}`);

          expect(e.message).to.equal('test error');

        }},
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(_ => 'log:' + _),
      done);

    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(_ => {
      process.stderr.write('log:' + _, _ => _);
    });

    setTimeout(() => {
      process.stderr.emit('error', new Error('test error'));
    }, 3000);

  });
  it('should emit write error then continue if skip === true and not leak memory', function (done) {

    log.header(`${this.test.title}`);

    errorHarness({t: 100, timeout: 100, skip: true/*, logger: log*/},
      {throwOn: "log:5", onThrown: cb => {throw new Error('random')}},
      () => {
        return function (e, v) {
          log.write(`${v}\t${e.message}`);
        }
      },
      [1, 2, 3, 4, 6, 7, 8, 9].map(_ => 'log:' + _),
      done);

    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(_ => {
      process.stderr.write('log:' + _, _ => _);
    });

  });

});

