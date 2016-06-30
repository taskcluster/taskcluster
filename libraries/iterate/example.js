var Iterate = require('./');

i = new Iterate({
  maxIterations: 5,
  maxFailures: 2,
  maxIterationTime: 10,
  watchDog: 5,
  waitTime: 1,
  handler: (watchDog, state) => {
    return new Promise((res, rej) => {
      console.log('hi');
      setTimeout(res, 12);
    });
  },

});

i.start();
