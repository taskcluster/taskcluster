const {MonitorManager} = require('../');

const options = {
  shouldError: false,
  shouldUnhandle: false,
  patchGlobal: false,
  bailOnUnhandledRejection: false,
  errorConfig: {
    reporter: 'TestReporter',
    log: true,
  },
};

process.argv.slice(2).forEach(arg => {
  options[arg.slice(2)] = true;
});

MonitorManager.setup({
  serviceName: 'foo-testing',
  ...options,
});

if (options.shouldError) {
  throw new Error('hello there');
}
if (options.shouldUnhandle) {
  Promise.reject(new Error('whaaa'));
}
