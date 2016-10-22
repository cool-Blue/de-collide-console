/**
 * Created by cool.blue on 23-Oct-16.
 */
'use strict';
const chai = require('chai');
const expect = chai.expect;
const eventsQ = require('../events');
const fs = require('fs');
const util = require('util');


describe('events', function (done) {
  this.timeout(5000);
  var queue = [];
  var test = new eventsQ(queue, 200);

  it('it should step through and drain', function (done) {
    test.on('drain', (v, s) => {
      console.log(`drained ${v} ${util.inspect(s)}`);
      done()
    });
    console.log('hooked');
    [1, 2, 3, 4, 5].forEach(x => queue.push(x));

    eventsQ.unhook();
    console.log('async');
  })
});
