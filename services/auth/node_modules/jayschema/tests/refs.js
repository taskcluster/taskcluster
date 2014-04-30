// Unit tests. Run with mocha.

/*global describe:true it:true should:true */


var should = require('should')
  , JaySchema = require('../lib/jayschema.js')
  ;

describe('JSON references:',
  function()
{
  describe('reference previously manually-registered schema:', function() {

    var jj = new JaySchema();
    var sch;

    var otherSchema = {
      id: 'http://foo.bar/name#',
      type: 'object',
      required: ['first', 'last'],
      properties: {
        first: { $ref: '#/definitions/nameField' },
        last: { type: 'string' }
      },
      definitions: {
        nameField: { type: 'string' }
      }
    };

    jj.register(otherSchema);

    it('should validate', function() {
      sch = {
        type: 'object',
        properties: {
          name: { $ref: 'http://foo.bar/name#' }
        }
      };

      jj.validate({name: {first: 'Mohammed', last: 'Chang'}}, sch)
        .should.be.empty;
    });

    it('should fail validation', function() {
      sch = {
        type: 'object',
        properties: {
          name: { $ref: 'http://foo.bar/name#' }
        }
      };

      jj.validate({name: {last: 'Chang'}}, sch).should.not.be.empty;
    });

  });

  describe('validate using the string id of a registered schema', function() {

    var jj = new JaySchema();

    var schema = {
      id: 'http://foo.bar/name#',
      type: 'object',
      required: ['first', 'last'],
      properties: {
        first: { $ref: '#/definitions/nameField' },
        last: { type: 'string' }
      },
      definitions: {
        nameField: { type: 'string' }
      }
    };

    jj.register(schema);

    it('should validate', function() {
      var data = {
        'first': 'John',
        'middle': 'Q.',
        'last': 'Public'
      };

      jj.validate(data, 'http://foo.bar/name#').should.be.empty;
    });

    it('should fail validation', function() {
      var data = {
        'first': 'John'
      };

      jj.validate(data, 'http://foo.bar/name#').should.not.be.empty;
    });

  });

  describe('ensure that JaySchema.prototype.isRegistered(id) works',
    function()
  {
    var jj = new JaySchema();    
    var sch = {
      id: 'http://foo.bar/baz#',
      type: 'string',
      definitions: {
        qux: { id: '#qux', type: 'integer' }
      }
    };
    jj.register(sch);

    it('should show the schema is registered', function() {
      jj.isRegistered('http://foo.bar/baz#').should.be.true;
      jj.isRegistered('http://foo.bar/baz').should.be.true;
      jj.isRegistered('http://foo.bar/baz#qux').should.be.true;
    });

    it('should show the schema is not registered', function() {
      jj.isRegistered('http://qux.zzz/baz#').should.be.false;
    });

  });

});
