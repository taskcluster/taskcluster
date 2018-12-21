// This test needs to take place in an external function that we
// fork to avoid issues with uncaught exceptions and mocha and
// our process.exit behavior.
let monitoring = require('../');
let authmock = require('./authmock');
let nock = require('nock');

function nockit(delay) {
  nock('https://app.getsentry.com')
    .filteringRequestBody(/.*/, '*')
    .post('/api/12345/store/', '*')
    .delay(delay)
    .reply(200, () => {
      console.log('Called Sentry.');
    });
}

if (process.argv[2] === '--correct') {
  nockit(0);
} else {
  nockit(10000);
}

authmock.setup();
monitoring({
  project: 'tc-lib-monitor',
  credentials: {clientId: 'test-client', accessToken: 'test'},
  crashTimeout: 250,
}).then((monitor) => {
  process.nextTick(() => { throw new Error('This should bubble up to the top'); });
});
