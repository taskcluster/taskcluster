// Unit tests. Run with mocha.

/*global describe:true it:true */


var should = require('should')
  , JaySchema = require('../lib/jayschema.js')
  ;

describe('Custom loaders:', function() {

  describe('pathological loader', function() {

    // “loads” schemas that are infinitely recursive
    var counter = 0;
    var pathologicalLoader = function(ref, callback) {
      callback(null, { '$ref': 'schema-' + counter });
      ++counter;
    };

    var js = new JaySchema(pathologicalLoader);

    it('should not be allowed to recurse indefinitely', function(done) {
      js.validate({}, { '$ref': 'foo' }, function(errs) {
        should.exist(errs);
        done();
      });
    });
  });

  describe('multiple simultaneous validation against a schema that needs to ' +
    'be loaded', function()
  {
    // waits, and then “loads” a schema
    var slowLoader = function(ref, callback) {
      setTimeout(function() {
        var schema = { 'type': 'integer', 'multipleOf': 8 };
        callback(null, schema);
      }, 100);
    };

    var js = new JaySchema(slowLoader);

    it('should work', function(done) {
      var schema = { '$ref': 'http://foo.bar/baz#' };

      var instance1 = 64;
      var instance2 = 808;

      var counter = 2;

      js.validate(instance1, schema, function(errs) {
        should.not.exist(errs);
        counter--;
        if (counter === 0) { done(); }
      });

      js.validate(instance2, schema, function(errs) {
        should.not.exist(errs);
        counter--;
        if (counter === 0) { done(); }
      });
    });
  });
});
