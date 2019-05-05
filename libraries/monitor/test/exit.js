const {defaultMonitorManager} = require('../');

const options = {
  shouldError: false,
  shouldUnhandle: false,
  patchGlobal: false,
  bailOnUnhandledRejection: false,
};

process.argv.slice(2).forEach(arg => {
  options[arg.slice(2)] = true;
});

defaultMonitorManager.configure({
  serviceName: 'foo-testing',
});
defaultMonitorManager.setup(options);

if (options.shouldError) {
  throw new Error('hello there');
}
if (options.shouldUnhandle) {
  Promise.reject(new Error('whaaa'));
}
