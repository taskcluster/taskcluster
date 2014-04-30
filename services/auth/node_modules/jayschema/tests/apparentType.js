// Unit tests. Run with mocha.

/*global describe:true it:true */


var should = require('should')
  , schemaValidator = require('../lib/suites/draft-04')
  , core = require('../lib/suites/draft-04/core.js')
  ;

describe('Core § 3.5 JSON Schema primitive types:', function() {
  describe('array:', function() {
    it('should return "array"', function() {
      core.apparentType([]).should.equal('array');
      core.apparentType([15, 37, 'abcdefg']).should.equal('array');
    });

    it('should not return "array" for non-array types', function() {
      core.apparentType(true).should.not.equal('array');
      core.apparentType(false).should.not.equal('array');
      core.apparentType(0).should.not.equal('array');
      core.apparentType(42).should.not.equal('array');
      core.apparentType(42.1).should.not.equal('array');
      core.apparentType(null).should.not.equal('array');
      core.apparentType({foo: [1, 2, 3]}).should.not.equal('array');
      core.apparentType('hello world').should.not.equal('array');
    });
  });

  describe('boolean:', function() {
    it('should return "boolean"', function() {
      core.apparentType(true).should.equal('boolean');
      core.apparentType(false).should.equal('boolean');
      core.apparentType(1 === 1).should.equal('boolean');
      core.apparentType(1 !== 1).should.equal('boolean');
    });

    it ('should not return "boolean" for non-boolean types', function() {
      core.apparentType([true, false]).should.not.equal('boolean');
      core.apparentType(0).should.not.equal('boolean');
      core.apparentType(42).should.not.equal('boolean');
      core.apparentType(42.1).should.not.equal('boolean');
      core.apparentType(null).should.not.equal('boolean');
      core.apparentType({foo: [1, 2]}).should.not.equal('boolean');
      core.apparentType('hello world').should.not.equal('boolean');
    });
  });

  describe('integer:', function() {
    it('should return "integer"', function() {
      core.apparentType(42).should.equal('integer');
      core.apparentType(42.0).should.equal('integer');
      core.apparentType(0).should.equal('integer');
    });

    it ('should not return "integer" for non-integer types', function() {
      core.apparentType([true, false]).should.not.equal('integer');
      core.apparentType(true).should.not.equal('integer');
      core.apparentType(false).should.not.equal('integer');
      core.apparentType(42.1).should.not.equal('integer');
      core.apparentType(null).should.not.equal('integer');
      core.apparentType({foo: [1, 2]}).should.not.equal('integer');
      core.apparentType('hello world').should.not.equal('integer');
    });
  });

  describe('number:', function() {
    it('should return "number"', function() {
      core.apparentType(42.1).should.equal('number');
    });

    it ('should not return "number" for non-number types', function() {
      core.apparentType([true, false]).should.not.equal('number');
      core.apparentType(true).should.not.equal('number');
      core.apparentType(false).should.not.equal('number');
      core.apparentType(0).should.not.equal('number');
      core.apparentType(42).should.not.equal('number');
      core.apparentType(null).should.not.equal('number');
      core.apparentType({foo: [1, 2, 3]}).should.not.equal('number');
      core.apparentType('hello world').should.not.equal('number');
    });
  });

  describe('null:', function() {
    it('should return "null"', function() {
      core.apparentType(null).should.equal('null');
    });

    it ('should not return "null" for non-null types', function() {
      core.apparentType([true, false]).should.not.equal('null');
      core.apparentType(true).should.not.equal('null');
      core.apparentType(false).should.not.equal('null');
      core.apparentType(0).should.not.equal('null');
      core.apparentType(42).should.not.equal('null');
      core.apparentType(42.1).should.not.equal('null');
      core.apparentType({foo: [1, 2, 3]}).should.not.equal('null');
      core.apparentType('hello world').should.not.equal('null');
    });
  });

  describe('object:', function() {
    it('should return "object"', function() {
      core.apparentType({}).should.equal('object');
      core.apparentType({a: 1, b: 2}).should.equal('object');
      core.apparentType({foo: {a: 1, b: 2}}).should.equal('object');
      core.apparentType({bar: [13, 17, 42]}).should.equal('object');
    });

    it ('should not return "object" for non-object types', function() {
      core.apparentType([true, false]).should.not.equal('object');
      core.apparentType(true).should.not.equal('object');
      core.apparentType(false).should.not.equal('object');
      core.apparentType(0).should.not.equal('object');
      core.apparentType(42).should.not.equal('object');
      core.apparentType(42.1).should.not.equal('object');
      core.apparentType(null).should.not.equal('object');
      core.apparentType('hello world').should.not.equal('object');
    });

    it('should not mistake null or Array for "object"', function() {
      core.apparentType(null).should.not.equal('object');
      core.apparentType(['a', 'b', 'c']).should.not.equal('object');
    });
  });

  describe('string:', function() {
    it('should return "string"', function() {
      core.apparentType('hello world').should.equal('string');
    });

    it ('should not return "string" for non-string types', function() {
      core.apparentType([true, false]).should.not.equal('string');
      core.apparentType(true).should.not.equal('string');
      core.apparentType(false).should.not.equal('string');
      core.apparentType(0).should.not.equal('string');
      core.apparentType(42).should.not.equal('string');
      core.apparentType(42.1).should.not.equal('string');
      core.apparentType(null).should.not.equal('string');
      core.apparentType({foo: 'hello'}).should.not.equal('string');
    });
  });
});
