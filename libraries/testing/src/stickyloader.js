const _ = require('lodash');
const assert = require('assert');

const stickyLoader = load => {
  let overwrites = {};
  const stack = [];

  // clone the overwrites, careful to do a shallow clone everything except cfg,
  // which gets a deep clone so it can be modified in place.
  const _cloneOverwrites = overwrites => {
    const rv = _.clone(overwrites);
    if (overwrites.cfg) {
      rv.cfg = _.cloneDeep(overwrites.cfg);
    }
    return rv;
  };

  /* load, storing the loaded component */
  const sticky = async (component, _overwrites) => {
    if (_overwrites) {
      throw new Error('Do not call stickyLoader with overwrites (a second argument)');
    }
    const value = await load(component, overwrites);
    overwrites[component] = value;
    return value;
  };

  // save the current state of the loader, for later `restore`. Saves
  // and restores operate on a stack, in LIFO order.
  sticky.save = () => {
    stack.push(_cloneOverwrites(overwrites));
  };

  // restore to the save point at the top of the stack
  sticky.restore = () => {
    assert(stack.length > 0, 'unbalanced load.save/restore');
    overwrites = stack.pop();
  };

  // edit the cfg component in-place, at the given dotted path
  sticky.cfg = (path, value) => {
    assert('cfg' in overwrites, 'cannot call `load.cfg` until the `cfg` component is loaded');
    _.set(overwrites['cfg'], path, value);
  };

  // inject a dependency
  sticky.inject = (component, value) => {
    overwrites[component] = value;
  };

  // remove a dependency
  sticky.remove = component => {
    delete overwrites[component];
  };

  return sticky;
};

module.exports = stickyLoader;
