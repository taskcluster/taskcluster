// load from each of the submodules
[
  require('./validate'),
  require('./sets'),
  require('./satisfaction'),
  require('./normalize'),
].forEach(submodule => {
  for (const key in submodule) {
    if (submodule.hasOwnProperty(key)) {
      exports[key] = submodule[key];
    }
  }
});
