// load from each of the submodules
[
  require('./scopes/validate'),
  require('./scopes/sets'),
  require('./scopes/satisfaction'),
  require('./scopes/normalize'),
  require('./scopes/expressions'),
].forEach(submodule => {
  for (const key of Object.keys(submodule)) {
    exports[key] = submodule[key];
  }
});
