const debug = require('debug')('docker-worker:async-dump');
const {createHook} = require('async_hooks');
const {stackTraceFilter} = require('mocha/lib/utils');

const allResources = new Map();

// this will pull Mocha internals out of the stacks
const filterStack = stackTraceFilter();

const hook = createHook({
  init(asyncId, type, triggerAsyncId) {
    allResources.set(asyncId, {type, triggerAsyncId, stack: (new Error()).stack});
  },
  destroy(asyncId) {
    allResources.delete(asyncId);
  },
}).enable();

global.asyncDump = module.exports = () => {
  hook.disable();
  debug('STUFF STILL IN THE EVENT LOOP:');
  allResources.forEach(value => {
    debug(`Type: ${value.type}`);
    debug(filterStack(value.stack));
    debug('\n');
  });
};
