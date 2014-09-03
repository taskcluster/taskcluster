// Lazy load all submodules, not many production systems need to load
// 'testing' and loading code actually takes time.
[
  'config',
  'app',
  'validator',
  'API',
  'Entity',
  'Exchanges',
  'testing',
  'stats',
  'utils'
].forEach(function(name) {
  Object.defineProperty(exports, name, {
    enumerable: true,
    get:        function() { return require('./' + name.toLowerCase()); }
  });
});
