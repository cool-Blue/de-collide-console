/**
 * Created by cool.blue on 22-Sep-16.
 */
const ConsoleMux = require('./');

// Prepare test data
var template = [1,2,3,4,5,6,7,8,9],
  messages = [];

  template.forEach(_ => {
    messages.push('log:' + _);
    messages.push('error:' + _)
  });

// establish the console MUX process
new ConsoleMux({t: 500, skip: true});
ConsoleMux.timeout(0);

// Start outputting to the hooked console, alternating between .log and .error
messages.forEach(_ => {
  console[_.substring(0,_.indexOf(':'))](_);
});

// set an error listener for the queue
ConsoleMux.on('error', (e, _) => {
    process.stdout.write(`${e}\t${_}`)
});
// throw an error after a timeout
setTimeout(_ => {process.stderr.emit('error', new Error('test error'))}, 4000);

// unhook the console after the drain event
ConsoleMux.on('drain' ,(e) => {
  ConsoleMux.unhook();
  console.log('drained');
  if ( e )if ( e instanceof Error )  throw(e);
});
