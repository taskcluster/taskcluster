var lint = require('mocha-eslint');

var paths = [
  'src/*.js',
  '!src/apis.js',
  'test/*.js',
];

lint(paths);
