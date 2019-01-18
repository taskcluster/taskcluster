const Monitor = require('../');

const options = {
  shouldError: false,
  shouldUnhandle: false,
  patchGlobal: false,
  bailOnUnhandledRejection: false,
};

process.argv.slice(2).forEach(arg => {
  options[arg.slice(2)] = true;
});

const monitor = new Monitor({
  projectName: 'foo-testing',
  ...options,
});

if (options.shouldError) {
  throw new Error('hello there');
}
if (options.shouldUnhandle) {
  Promise.reject('whaaa');
}
