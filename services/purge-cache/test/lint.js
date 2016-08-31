let lint = require('mocha-eslint');

let paths = [
  'src/*.js',
  'test/*.js',
];

lint(paths);
