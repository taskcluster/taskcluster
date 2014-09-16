/*jshint expr:true */
var jjv = require('..')();
var expect = require('chai').expect;

describe("$data v5 proposal", function () {
  var range_schema = {
    type: "object",
    properties: {
      a: {
        "type": "number",
        "maximum": {"$data": "1/b"}
      },
      b: {
        "type": "number",
        "minimum": {"$data": "1/a"}
      }
    },
    required: ["a", "b"]
  };

 
  before(function () {
    jjv.addSchema('range', range_schema);
  });

  it("valid", function () {
    expect(jjv.validate('range', {a: 1, b: 2})).to.be.null;
  });

  it("invalid", function () {
    expect(jjv.validate('range', {a: 2, b: 1})).not.to.be.null;
  });
});

describe("constant v5 proposal", function () {
  it("normal constant", function () {
    expect(jjv.validate({type: 'object', properties: {"x": {type: 'string', constant: 'foo'}}}, {x: 'foo'})).to.be.null;
    expect(jjv.validate({type: 'object', properties: {"x": {type: 'string', constant: 'foo'}}}, {x: 'fxoo'})).not.to.be.null;
  });

  it("with $data json pointer", function () {
    expect(jjv.validate({ type: 'object', properties: { "x": { type: 'string' }, "y": {constant: {$data: '1/x'}}}}, {x: 'foo', y: 'foo'})).to.be.null;
    expect(jjv.validate({ type: 'object', properties: { "x": { type: 'string' }, "y": {constant: {$data: '1/x'}}}}, {x: 'bar', y: 'bar'})).to.be.null;
    expect(jjv.validate({ type: 'object', properties: { "x": { type: 'string' }, "y": {constant: {$data: '1/x'}}}}, {x: 'foo', y: 'bar'})).not.to.be.null;
  });
});
