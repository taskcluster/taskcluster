// Unit tests. Run with mocha.
//
// These tests ensure that JaySchema works with instances that are
// not derived from Object.

/*global describe:true it:true */


var should = require('should')
  , JaySchema = require('../lib/jayschema.js')
  , fs = require('fs')
  , path = require('path')
  ;


var BLACKLISTED_TESTS = {

  'refsAsync.json': {
    '*': 'these tests only apply in async mode'
  }

};

function duplicateWithNullPrototype(src) {
  if (!(src instanceof Object)) { return src; }

  if (Array.isArray(src)) {
    return Array.prototype.map.call(src, duplicateWithNullPrototype);
  }

  var dest = Object.create(null);
  Object.keys(src).forEach(function(key) {
    if (src[key] instanceof Object) {
      dest[key] = duplicateWithNullPrototype(src[key]);
    } else {
      dest[key] = src[key];
    }
  });
  return dest;
}

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

describe('Our test suite (running synchronously, instances without ' +
  'Object.prototype):', function()
{

  var files = getTests(path.join(__dirname, 'our-tests'));

  for (var index = 0, len = files.length; index !== len; ++index) {
    var jsonFile = files[index];
    var testGroups = require(jsonFile);

    testGroups.forEach(function(group) {
      describe(path.relative('.', jsonFile) + '|' + group.description + ':',
        function()
      {
        var nullPrototypeSchema = duplicateWithNullPrototype(group.schema);

        group.tests.forEach(function(test) {

          if (!shouldSkip(jsonFile, group.description, test.description)) {
            it(test.description, function() {
              var jj = new JaySchema();
              var result = jj.validate(duplicateWithNullPrototype(test.data),
                nullPrototypeSchema);
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
