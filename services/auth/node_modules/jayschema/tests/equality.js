// Unit tests. Run with mocha.

/*global describe:true it:true */


var should = require('should')
  , schemaValidator = require('../lib/suites/draft-04')
  , core = require('../lib/suites/draft-04/core.js')
  ;

describe('Core § 3.6 JSON value equality:', function() {
  describe('null:', function() {
    it('should be equal', function() {
      core.jsonEqual(null, null).should.be.true;
    });

    it('should not be equal', function() {
      core.jsonEqual(null, undefined).should.be.false;
      core.jsonEqual(null, {}).should.be.false;
      core.jsonEqual(null, 0).should.be.false;
      core.jsonEqual(null, false).should.be.false;
      core.jsonEqual(null, '').should.be.false;
    });
  });

  describe('boolean:', function() {
    it('should be equal', function() {
      core.jsonEqual(true, true).should.be.true;
      core.jsonEqual(false, false).should.be.true;
    });

    it('should not be equal', function() {
      core.jsonEqual(true, false).should.be.false;
      core.jsonEqual(false, true).should.be.false;
      core.jsonEqual(true, {}).should.be.false;
      core.jsonEqual(true, 0).should.be.false;
      core.jsonEqual(true, '').should.be.false;
    });
  });

  describe('string:', function() {
    it('should be equal', function() {
      core.jsonEqual('hello', 'hello').should.be.true;
    });

    it('should not be equal', function() {
      core.jsonEqual('hello', 'goodbye').should.be.false;
      core.jsonEqual('hello', {}).should.be.false;
      core.jsonEqual('hello', 0).should.be.false;
      core.jsonEqual('hello', '').should.be.false;
      core.jsonEqual('0', 0).should.be.false;
    });
  });

  describe('number:', function() {
    it('should be equal', function() {
      core.jsonEqual(17, 17).should.be.true;
      core.jsonEqual(17, 17.0).should.be.true;
      core.jsonEqual(3.14195, 3.14195).should.be.true;
      core.jsonEqual(1/3, 1/3).should.be.true;
    });

    it('should not be equal', function() {
      core.jsonEqual(7, '7').should.be.false;
      core.jsonEqual(0, false).should.be.false;
      core.jsonEqual(42.1, 42.2).should.be.false;
      core.jsonEqual(42.1, 42).should.be.false;
    });
  });

  describe('array:', function() {
    it('should be equal', function() {
      core.jsonEqual([], []).should.be.true;
      core.jsonEqual(['a', 'b', 'c'], ['a', 'b', 'c'])
        .should.be.true;

      core.jsonEqual(
        ['a', 'b', {foo: 'bar', baz: 42}],
        ['a', 'b', {baz: 42, foo: 'bar'}]
      ).should.be.true;
    });

    it('should not be equal', function() {
      core.jsonEqual(['a', 'b', 'c'], ['a', 'c', 'b'])
        .should.not.be.true;
      core.jsonEqual(['a', 'b', 'c'], ['a', 'b'])
        .should.not.be.true;
      core.jsonEqual(['a', 'b'], ['a', 'b', 'c'])
        .should.not.be.true;
      core.jsonEqual(
        ['a', 'b', {foo: 'bar', baz: 42}],
        ['a', 'b', {baz: 42, foo: 'bar', x:10}]
      ).should.not.be.true;
      core.jsonEqual(['a', 'b'], {}).should.not.be.true;
    });
  });


  describe('object:', function() {
    it('should be equal', function() {
      core.jsonEqual({}, {}).should.be.true;
      core.jsonEqual({foo: 'bar', baz: 42}, {foo: 'bar', baz: 42})
        .should.be.true;
      core.jsonEqual({foo: 'bar', baz: 42}, {baz: 42, foo: 'bar'})
        .should.be.true;

      core.jsonEqual(
        {id: 1, posts: [37, 42], user: {name: 'Fred', friends: 55}},
        {user: {friends: 55, name: 'Fred'}, posts: [37, 42], id: 1}
      ).should.be.true;
    });

    it('should not be equal', function() {
      core.jsonEqual({}, {age: 42}).should.not.be.true;
      core.jsonEqual({}, null).should.not.be.true;
      core.jsonEqual(
        {foo: 'bar', baz: 42},
        {foo: 'bar', baz: 42, qux: 37}
      ).should.not.be.true;
      core.jsonEqual(
        {id: 1, posts: [37, 42], user: {name: 'Fred', friends: 55}},
        {user: {friends: 55, name: 'Fred'}, posts: [37, 42], id: 2}
      ).should.not.be.true;
    });
  });
});
