// Unit tests. Run with mocha.

/*global describe:true it:true should:true */


var should = require('should')
  , JaySchema = require('../lib/jayschema.js')
  , v4Schema = require('../lib/suites/draft-04/json-schema-draft-v4.json')
  ;

var schemaUrl = 'http://jayschema.org/test-targets/json-schema-draft-4.json#';

describe('JSON schema self-validation test:', function() {
  describe('validate meta-schema (synchronously):', function() {
    var jj = new JaySchema();
    it('should self-validate the JSON Schema schema', function() {
      jj.validate(v4Schema, v4Schema).should.be.empty;
    });
  });

  describe('validate meta-schema (asynchronously):', function() {
    var jj = new JaySchema(JaySchema.loaders.http);
    it('should self-validate the JSON Schema schema', function(done) {
      jj.validate(v4Schema, {$ref: schemaUrl}, function(errs) {
        should.not.exist(errs);
        done();
      });
    });
  });

});
