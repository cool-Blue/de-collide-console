/**
 * Created by cool.blue on 18-Sep-16.
 */
'use strict';
const chai = require('chai');
const expect = chai.expect;
const Decollide = require('../');
const fs = require('fs');
const path = require('path');

var log = (function(wrapperSelector) {
  var _basePath = path.normalize(__dirname + '\\..');

  function _header (message) {
  return `\n*********************************************************************************************\n${message}\n*********************************************************************************************\n`;
}

  function _trace (basePath) {
    var stack = (new Error()).stack;
    if (stack) {
      return stack.split('\n').filter(l =>
          l.includes(basePath) && !l.includes("node_modules")
        ).slice(2)
          .map(l => l.replace(basePath, ""))
          .join("\n") + "\n";
    }
  }

  function _trim(m) {
    return m.replace(/\n$/, "") + "\n";
  }

  if (typeof document === 'undefined') {
    var logStream = fs.createWriteStream('log.txt');
    return {
      write: (message) =>
        logStream.write(`${_trim(message)}${_trim(_trace(_basePath))}`),
      header: function (message) {
        this.write(`${_header(message)}`)
      }
    }
  }
  else {
    var logDiv = document.createElement('div');

    logDiv = document.querySelector(wrapperSelector).appendChild(logDiv);
    logDiv.outerHTML =
      `<div id="log-wrapper" style= "margin: 10px; cursor: pointer;">
            <h1>Log Output</h1>
            <div id="log-panel" style="white-space: pre; display: none; overflow: scroll; height: 50%"><h2 id="log" "></h2></div>
        </div>`;
    logDiv = document.querySelector('#log');
    var logPanel = document.querySelector('#log-panel');
    var h = document.querySelector('#log-wrapper h1');

    h.addEventListener('click', e =>
      logPanel.style.display = logPanel.style.display === 'none' ? 'block' : 'none'
    );

    return {
      write: (message) =>
        logDiv.textContent += `${_trim(message)}${_trim(_trace(""))}`,
      header: function (message) {
        this.write(`${_header(message)}`)
      }
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
 * get the elapsed time in ms
 * @returns {function()}
 * @constructor
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

  beforeEach(function () {
    hooks.save();
  });
  afterEach(function () {
    hooks.restore();
  });

  this.timeout(5000);

  it('should throw if hooked again', function () {

    log.header(`${this.test.title}`);

    new Decollide(delay, log);
    expect(() => new Decollide(delay, log)).to.throw(Decollide.errors.InstantiationError)

  });
  it('should restore standard writes', function (done) {
    var writes = [];
    var writeHooks = [];
    var linesReceived = [];
    var toSend = {log: 'log-log', err: 'log-error'};

    log.header(`${this.test.title}`);

    // hook stdout and stderr
    // store their original write methods in writes[]
    // and redirect writes to push linesReceived[]
    // store the redirect methods in writeHooks[]
    var _writeHook = _ => {
      linesReceived.push(_)
    };
    ['stdout', 'stderr'].forEach(chanel => {
      writes.push(process[chanel].write);
      process[chanel].write = _writeHook;
      writeHooks.push(process[chanel].write)
    });

    // establish the regulated queue on both channels, write
    // to them and listen for the drain events
    new Decollide(delay, log);
    console.log(toSend.log);
    console.error(toSend.err);
    Decollide.on('drain', function (value, source) {
      // restore the test hooks
      Decollide.unhook();
      var outWrite = process.stdout.write;
      var errWrite = process.stderr.write;

      // resume normal transmission
      hooks.restore();

      // confirm that the hooks worked
      expect(linesReceived[0]).to.include(toSend.log);
      expect(linesReceived[1]).to.include(toSend.err);
      // check that the test hooks were restored
      expect(outWrite).to.equal(_writeHook);
      expect(errWrite).to.equal(_writeHook);
      log.write(`${value} ${source}`);
      done();
    });

  });
  it('should preserve the order of output and step with delay', function (done) {

    var elapsed = Elapsed();
    var elapsedTime = Elapsed();

    var trace = [];

    log.header(`${this.test.title}`);

    var template = [1,2,3,4,5,6,7,8,9],
      messages = [];
    template.forEach(_ => {
      messages.push('log:' + _);
      messages.push('error:' + _)
    });
    function* checkSeq (outputs, steps, writing) {

      var elapsedTime = Elapsed();

      var i = 0, line;
      line = yield;
      while(writing()) {
        line = yield steps[steps.push(
          {line: outputs[i], dt: elapsedTime(), i: i++}
        ) -1]
      }
    }

    // test hooks
    process.stdout.write = process.stderr.write = function (line) {
      var state = seq.next(line);
      if (state.done) return;
      expect(line).to.equal(state.value.line + '\n');
      if (state.value.i)
        expect(state.value.dt).to.be.within(0.9 * delay, 1.5 * delay);
    };

    new Decollide(delay, log);

    var steps = [];
    var seq = checkSeq(messages, steps, Decollide.writing.bind(Decollide));

    seq.next();

    messages.forEach(_ => {
      trace.push(elapsedTime() + '\t' + _);
      console[_.substring(0, _.indexOf(':'))](_);
    });
    trace.push(elapsed() + '\t' + 'written');
    Decollide.on('drain', function (value, source) {
      trace.push(elapsed() + '\t' + 'drained');
      Decollide.unhook();
      hooks.restore();
      log.write(`unhooked ${value} ${source}`);
      trace.push(elapsed() + '\t' + 'reverted');
      done();
    });

  });
  it('should honour callback for two arg signature', function (done) {

    log.header(`${this.test.title}`);

    var linesReceived = [];
    var _writeHook = (_, cb) => {
      linesReceived.push(_);
      cb()
    };
    ['stdout', 'stderr'].forEach(chanel => {
      process[chanel].write = _writeHook;
    });

    var cb = (function () {
      var calls = 0;
      var f = function (chunk) {
        log.write(chunk);
        return calls++
      };
      f.calls = function () {
        return calls
      };
      return f;
    })();
    new Decollide(1000, log);
    var cbCount;
    Decollide.on('drain', function (value, source) {
      Decollide.unhook();
      hooks.restore();

      expect((cbCount = cb.calls())).to.equal(2);

      log.write(`unhooked ${value} ${source} ${cbCount}`);
      done();
    });
    log.write("about to write");
    process.stdout.write('stdout\n', cb);
    process.stderr.write('stderr\n', cb);

  });
  it('should honour callback for three arg signature', function (done) {

    var linesReceived = [];
    var _writeHook = (_, enc, cb) => {
      linesReceived.push(_);
      cb()
    };
    ['stdout', 'stderr'].forEach(chanel => {
      process[chanel].write = _writeHook;
    });

    var cb = (function () {
      var calls = 0;
      var f = function (chunk) {
        log.write(chunk);
        return calls++
      };
      f.calls = function () {
        return calls
      };
      return f;
    })();

    log.header(`${this.test.title}`);

    new Decollide(1000, log);
    var cbCount;
    Decollide.on('drain', function (value, source) {
      Decollide.unhook();

      hooks.restore();

      expect((cbCount = cb.calls())).to.equal(2);

      log.write(`unhooked ${value} ${source} ${cbCount}`);
      done();
    });
    log.write("about to write");
    process.stdout.write('stdout\n', 'utf8', cb);
    process.stderr.write('stderr\n', 'utf8', cb);

  });
  it('should throw on write timeout', function (done) {
    process.stderr.write = function (line) {
      console.log(line)
    };

    log.header(`${this.test.title}`);

    new Decollide(100);
    Decollide.timeout(0);
    process.stderr.write('should throw', _ => _);
    Decollide.on('error', function (e) {
      Decollide.unhook();

      hooks.restore();

      expect(e).to.be.an.instanceof(Decollide.errors.WriteTimeoutError);
      
      done();
    });
  });
  it('should throw on stream errors', function (done) {
    new Decollide(delay);

    log.header(`${this.test.title}`);

    Decollide.on('error', function (e) {
      Decollide.unhook();

      hooks.restore();

      expect(e.message).to.equal('test error');

      done();
    });
    process.stderr.write('should throw', _ => _);
    process.stderr.emit('error', new Error('test error'))
  })
});

