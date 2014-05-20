// Unit tests. Run with mocha.

/*global describe:true it:true */


var assert = require('assert')
  , httpLoader = require('../lib/httpLoader.js')
  ;

describe('GET request wrapper:',
  function()
{
  describe('retrieve JSON Schema Draft V4 schema:', function() {

    it('should retrieve the schema', function(done) {
      var url = 'http://jayschema.org/test-targets/json-schema-draft-4.json#';
      httpLoader(url, function(err, schema) {
        if (err) { throw err; }
        assert.equal('http://json-schema.org/draft-04/schema#', schema.id);
        done();
      });
    });

    it('should follow 3xx redirects to retrieve a schema', function(done) {
      var url =
        'http://www.jayschema.org/test-targets/json-schema-draft-4.json#';
      httpLoader(url, function(err, schema) {
        if (err) { throw err; }
        assert.equal('http://json-schema.org/draft-04/schema#', schema.id);
        done();
      });
    });

    it('should retrieve a schema over HTTPS (SSL)', function(done) {
      var url = 'https://jayschema.org.s3.amazonaws.com/' +
        'test-targets/json-schema-draft-4.json#';
      httpLoader(url, function(err, schema) {
        if (err) { throw err; }
        assert.equal('http://json-schema.org/draft-04/schema#', schema.id);
        done();
      });
    });

    it('should fail to retrieve the URL', function(done) {
      var url = 'http://jayschema.org/test-targets/this-does-not-exist';
      httpLoader(url, function(err) {
        assert(err);
        done();
      });
    });

    it('should fail to get a schema, even though the URL is valid',
      function(done)
    {
      var url = 'http://jayschema.org/test-targets/not-a-schema.html';
      httpLoader(url, function(err) {
        assert(err);
        done();
      });
    });

  });

});
