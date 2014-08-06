var Promise = require('promise');
/**

function* waitForSomething () {
  // do stuffs...
  var exit = yield waitForEvent(process, 'exit');
}

*/
module.exports = function waitForEvent(listener, event) {
  return new Promise(function(accept, reject) {
    listener.on(event, function(message) {
      accept(message);
    });
  });
}
