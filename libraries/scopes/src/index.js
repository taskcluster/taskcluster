// load from each of the submodules
[
  require('./validate'),
  require('./sets'),
  require('./satisfaction'),
  require('./normalize'),
  require('./expressions'),
  require('./simplify'),
].forEach(submodule => {
  for (const key of Object.keys(submodule)) {
    exports[key] = submodule[key];
  }
});
