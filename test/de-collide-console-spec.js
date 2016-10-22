/**
 * Created by cool.blue on 18-Sep-16.
 */
'use strict';
const chai = require('chai');
const expect = chai.expect;
const Decollide = require('../');
const fs = require('fs');
const path = require('path');

var log = (function() {
  var _basePath = path.normalize(__dirname + '\\..');


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

  function _trim(m) {
    return m.replace(/\n$/, "") + "\n";
  }

  if (typeof document === 'undefined') {
    var logStream = fs.createWriteStream('log.txt');
    return {
      write: (message) => logStream.write(`${_trim(message)}${_trim(_trace(_basePath))}`)
    }
  }
  else {
    var logDiv = document.createElement('div');

    logDiv = document.querySelector('#mocha').appendChild(logDiv);
    logDiv.outerHTML = '<div id="log" style="white-space: pre; margin: 10px; font-size: 12px;"></div>';
    logDiv = document.querySelector('#log');

    return {
      write: function (message) {
        logDiv.textContent += `${_trim(message)}${_trim(_trace(""))}`;
      }
    }
  }
})();

var template = [1,2,3,4,5,6,7,8,9],
    logs = template.map(_ => 'log' + _),
    errs = template.map(_ => 'err' + _),
    messages = [],
    delay = 100;
template.forEach(_ => {
  messages.push('log:' + _);
  messages.push('error:' + _)
});

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
describe('deMUX', function () {

  beforeEach(function () {
    hooks.save();
  });
  afterEach(function () {
    hooks.restore();
  });

  this.timeout(5000);

  it('should restore standard writes', function (done) {
    var writes = [];
    var writeHooks = [];
    var linesReceived = [];
    var toSend = {log: 'log-log', err: 'log-error'};

    log.write(`\n${this.test.title}`);

    // hook stdout and stderr
    // store their original write methods in writes[]
    // and redirect writes to push nesReceived[]
    // store the redirect methods in writeHooks[]
    ['stdout', 'stderr'].forEach(chanel => {
      writes.push(process[chanel].write);
      process[chanel].write = _ => {
        linesReceived.push(_)
      };
      writeHooks.push(process[chanel].write)
    });

    // establish the regulated queue on both chanels
    // and listen for the drain events
    var q = new Decollide(delay, log);
    console.log(toSend.log);
    console.error(toSend.err);
    q.on('drain', function (value, source) {
      expect(linesReceived[0]).to.include(toSend.log);
      expect(linesReceived[1]).to.include(toSend.err);
      Decollide.unhook();
      expect(writeHooks).to.include(process.stdout.write);
      expect(writeHooks).to.include(process.stderr.write);
      hooks.restore();
      log.write(`should restore standard writes: unhooked ${value} ${source}`);
      expect(writes).to.include(process.stdout.write);
      expect(writes).to.include(process.stderr.write);
      linesReceived.forEach(_ => process.stdout.write(_));
      done();
    });

  });
  it('should preserve the order of output and step with delay', function (done) {

    var elapsed = Elapsed();
    var elapsedTime = Elapsed();

    var trace = [];

    log.write(`\n${this.test.title}`);

    // test hooks
    process.stdout.write = process.stderr.write = function (line) {
      var state = seq.next(line);
      if (state.done) return;
      expect(line).to.equal(state.value.line + '\n');
      if (state.value.i)
        expect(state.value.dt).to.be.within(0.9 * t, 1.5 * t);
    };
    var t = 100;

    var q = new Decollide(t, log);

    var steps = [];
    var seq = checkSeq(messages, steps, Decollide.writing.bind(q));

    var state0 = seq.next();

    messages.forEach(_ => {
      trace.push(elapsedTime() + '\t' + _);
      console[_.substring(0, _.indexOf(':'))](_);
    });
    trace.push(elapsed() + '\t' + 'written');
    q.on('drain', function (value, source) {
      trace.push(elapsed() + '\t' + 'drained');
      Decollide.unhook();
      hooks.restore();
      log.write(`unhooked ${value} ${source}`);
      trace.push(elapsed() + '\t' + 'reverted');
      trace.forEach(_ => console.log(_));
      steps.forEach(_ => console.dir(_));
      done();
    });

  });
  it('should honour callback for two arg signature', function (done) {

    var cb = (function () {
      var calls = 0;
      var f = function () {
        return calls++
      };
      f.calls = function () {
        return calls
      };
      return f;
    })();

    log.write(`\n${this.test.title}`);

    var q = new Decollide(600, log);
    var cbCount;
    q.on('drain', function (value, source) {
      expect((cbCount = cb.calls())).to.equal(2);
      Decollide.unhook();
      log.write(`unhooked ${value} ${source} ${cbCount}`);
      done();
    });
    log.write("about to write");
    process.stdout.write('stdout\n', cb);
    process.stderr.write('stderr\n', cb);

  });
  it('should throw on write timeout', function (done) {
    process.stderr.write = function (line) {
      console.log(line)
    };
    log.write(`\n${this.test.title}`);
    var q = new Decollide(100);
    Decollide.timeout(0);
    process.stderr.write('should throw', _ => _);
    q.on('error', function (e) {
      Decollide.unhook();
      delete process.stderr.write;
      expect(e).to.be.an.instanceof(Error);
      console.log(e);
      done();
    });
  });
  it('should throw on stream errors', function (done) {
    var q = new Decollide(100);
    log.write(`\n${this.test.title}`);
    q.on('error', function (e) {
      Decollide.unhook();
      delete process.stderr.write;
      expect(e).to.be.an.instanceof(Error);
      console.log(e);
      done();
    });
    process.stderr.write('should throw', _ => _);
    process.stderr.emit('error', new Error('test error'))
  })
});

