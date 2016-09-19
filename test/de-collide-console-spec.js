/**
 * Created by cool.blue on 18-Sep-16.
 */
'use strict';
const chai = require('chai');
const expect = chai.expect;
// const cAP = require('chai-as-promised');
// chai.use(cAP);
// const should = chai.should();

var template = [1,2,3,4,5,6,7,8,9],
    logs = template.map(_ => 'log' + _),
    errs = template.map(_ => 'err' + _),
    delay = 100;

var elapsedTime = (function () {
  var msecNow = () => process.hrtime()
    .reduce((ms, t, i) => ms += i ? t * 1e-6 : t * 1e3, 0);
  var t0 = msecNow();

  return () => {
    var dt = msecNow() - t0;
    t0 = msecNow();
    return dt
  }
})();

it('should preserve the order of output and step with delay', function () {

  function* checkSeq () {
    var i = 0, line;
    var outputs = logs.concat(errs);
    while((line = yield).indexOf('<<<EXIT>>>') !== 0) {
      expect(line).to.equal(outputs[i++] + '\n');
      expect(elapsedTime()).to.be.within(90, 150);
    }
    unhook();
  }

  var gen = checkSeq();
  gen.next();
  process.stdout.write = process.stderr.write = function (_) {
    gen.next(_);
  };

  const unhook = require('../').init(delay);
  logs.forEach(_ => console.log(_));
  errs.forEach(_ => console.error(_));
  console.log('<<<EXIT>>>');

});
