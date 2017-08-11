var lint = require('mocha-eslint');

var paths = [
  'src/*.js',
  'src/*/*.js',
  'test/*.js',
];

lint(paths);

