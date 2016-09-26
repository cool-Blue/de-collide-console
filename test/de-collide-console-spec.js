/**
 * Created by cool.blue on 18-Sep-16.
 */
'use strict';
const chai = require('chai');
const expect = chai.expect;
const decollide = require('../');

var template = [1,2,3,4,5,6,7,8,9],
    logs = template.map(_ => 'log' + _),
    errs = template.map(_ => 'err' + _),
    messages = [],
    delay = 100;
template.forEach(_ => {
  messages.push('log:' + _);
  messages.push('error:' + _)
});
function revert () {
  delete process.stderr.write;
  delete process.stdout.write;
}
/**
 * get the elapsed time in ms
 * @returns {function()}
 * @constructor
 */
function Elapsed () {
  var msecNow = () => process.hrtime()
    .reduce((ms, t, i) => ms += i ? t * 1e-6 : t * 1e3, 0);
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

  afterEach(function () {
    delete process.stdout.write;
    delete process.stderr.write;
  });

  this.timeout(5000);

  it('should restore standard writes', function (done) {
    var writes = [];
    var writeHooks = [];
    var linesReceived = [];
    var toSend = {log: 'log-log', err: 'log-error'};

    // hook stdout and stderr
    ['stdout', 'stderr'].forEach(chanel => {
      writes.push(process[chanel].write);
      process[chanel].write = _ => {
        linesReceived.push(_)
      };
      writeHooks.push(process[chanel].write)
    });

    var q = decollide(delay);
    console.log(toSend.log);
    console.error(toSend.err);
    q.on('drain', function () {
      expect(linesReceived[0]).to.include(toSend.log);
      expect(linesReceived[1]).to.include(toSend.err);
      q.unhook();
      expect(writeHooks).to.include(process.stdout.write);
      expect(writeHooks).to.include(process.stderr.write);
      revert();
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

    // test hooks
    process.stdout.write = process.stderr.write = function (line) {
      var state = seq.next(line);
      if (state.done) return;
      expect(line).to.equal(state.value.line + '\n');
      if (state.value.i)
        expect(state.value.dt).to.be.within(0.9 * t, 1.5 * t);
    };
    var t = 100;

    var q = decollide(t);

    var steps = [];
    var seq = checkSeq(messages, steps, q.writing.bind(q));

    var state0 = seq.next();

    messages.forEach(_ => {
      trace.push(elapsedTime() + '\t' + _);
      console[_.substring(0, _.indexOf(':'))](_);
    });
    trace.push(elapsed() + '\t' + 'written');
    q.on('drain', function () {
      trace.push(elapsed() + '\t' + 'drained');
      q.unhook();
      revert();
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

    var q = decollide(600);
    q.on('drain', function () {
      expect(cb.calls()).to.equal(2);
      q.unhook();
      console.log('unhooked');
      done();
    });
    process.stdout.write('stdout\n', cb);
    process.stderr.write('stderr\n', cb);

  });
  it('should throw on write timeout', function (done) {
    process.stderr.write = function (line) {
      console.log(line)
    };
    var q = decollide(100);
    q.timeout(0);
    process.stderr.write('should throw', _ => _);
    q.on('error', function (e) {
      q.unhook();
      delete process.stderr.write;
      expect(e).to.be.an.instanceof(Error);
      console.log(e);
      done();
    });
  });
  it('should throw on stream errors', function (done) {
    var q = decollide(100);
    q.on('error', function (e) {
      q.unhook();
      delete process.stderr.write;
      expect(e).to.be.an.instanceof(Error);
      console.log(e);
      done();
    });
    process.stderr.write('should throw', _ => _);
    process.stderr.emit('error', new Error('test error'))
  })
});

