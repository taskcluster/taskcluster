// Unit tests. Run with mocha.
//
// Execute Draft v4 tests defined in the JSON Schema Test Suite
// from: https://github.com/json-schema/JSON-Schema-Test-Suite

/*global describe:true it:true */


var should = require('should')
  , JaySchema = require('../lib/jayschema.js')
  , fs = require('fs')
  , path = require('path')
  ;

// support Node 0.6.x
var existsSync = fs.existsSync || path.existsSync;

var BLACKLISTED_TESTS = {

  'zeroTerminatedFloats.json': {
    '*': 'optional feature that can\'t be implemented in JavaScript'
  },

  'format.json': {
    'validation of regular expressions': {
      '*': 'Draft v3 feature removed from Draft v4, incorrectly remains in ' +
        'tests'
    }
  },

  'jsregex.json': {
    '*': 'Draft v3 feature removed from Draft v4, incorrectly remains in tests'
  }

};

function shouldSkip(jsonFile, testGroup, test) {
  var basename = path.basename(jsonFile);
  if (basename in BLACKLISTED_TESTS) {
    var items = BLACKLISTED_TESTS[basename];
    if ('*' in items) { return true; }
    if (testGroup in items) {
      if ('*' in items[testGroup] || test in items[testGroup]) {
        return true;
      }
    }
  }

  return false;
}

function getTests(dir) {
  var dirEntries = fs.readdirSync(dir);

  var files = [];
  var dirs = [];

  dirEntries.forEach(function(entry) {
    var fullPath = path.join(dir, entry);
    var stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      dirs.push(fullPath);
    } else if (stats.isFile()) {
      if (path.extname(entry) === '.json') {
        files.push(fullPath);
      }
    }
  });

  dirs.forEach(function(dir) {
    files = files.concat(getTests(dir));
  });

  return files;
}

describe('JSON Schema Test Suite:', function() {

  var testPath = path.join(__dirname, 'JSON-Schema-Test-Suite', 'tests',
    'draft4');

  it('should find the JSON-Schema-Test-Suite tests (do `git submodule init; ' +
    'git submodule update` to include them)', function()
  {
    existsSync(testPath).should.be.true;
  });

  if (!existsSync(testPath)) { return; }

  var files = getTests(testPath);

  for (var index = 0, len = files.length; index !== len; ++index) {
    var jsonFile = files[index];
    var testGroups = require(jsonFile);

    testGroups.forEach(function(group) {
      describe(path.relative('.', jsonFile) + '|' + group.description + ':',
        function()
      {
        group.tests.forEach(function(test) {

          if (!shouldSkip(jsonFile, group.description, test.description)) {
            it(test.description, function() {
              var jj = new JaySchema();
              var result = jj.validate(test.data, group.schema);
              if (test.valid) {
                result.should.be.empty;
              } else {
                result.should.not.be.empty;
              }
            });
          }

        }, this);
      });
    }, this);

  }
});
