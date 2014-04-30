// Unit tests. Run with mocha.

/*global describe:true it:true */


var should = require('should')
  , JaySchema = require('../lib/jayschema.js')
  , fs = require('fs')
  , path = require('path')
  ;

var BLACKLISTED_TESTS = {

  'refsSync.json': {
    '*': 'these tests only apply in non-async mode'
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

describe('Our test suite (running async):', function() {

  var files = getTests(path.join(__dirname, 'our-tests'));

  for (var index = 0, len = files.length; index !== len; ++index) {
    var jsonFile = files[index];
    var testGroups = require(jsonFile);

    testGroups.forEach(function(group) {
      describe(path.relative('.', jsonFile) + '|' + group.description + ':',
        function()
      {
        group.tests.forEach(function(test) {

          if (!shouldSkip(jsonFile, group.description, test.description)) {
            it(test.description, function(done) {
              var jj = new JaySchema(JaySchema.loaders.http);
              jj.validate(test.data, group.schema, function(errs) {
                if (test.valid) {
                  should.not.exist(errs);
                } else {
                  errs.should.not.be.empty;
                }
                done();
              });
            });
          }

        }, this);
      });
    }, this);

  }
});
