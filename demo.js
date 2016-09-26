/**
 * Created by cool.blue on 22-Sep-16.
 */
const decollide = require('./');

var template = [1,2,3,4,5,6,7,8,9],
    logs = template.map(_ => 'log' + _),
    errs = template.map(_ => 'err' + _),
    messages = [],
    delay = 100;
template.forEach(_ => {
  messages.push('log:' + _);
  messages.push('error:' + _)
});

var q = decollide(1000);

messages.forEach(_ => {
  console[_.substring(0,_.indexOf(':'))](_);
});

q.on('error', (e, _) => {
    process.stdout.write(`${e}\t${_}`)
});

setTimeout(_ => {process.stderr.emit('error', 'test error')}, 4000);

q.on('drain' ,() => {
  q.unhook();
});
