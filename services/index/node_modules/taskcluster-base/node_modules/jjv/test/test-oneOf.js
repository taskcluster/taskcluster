/*jshint expr:true */

var jjv = require('..')();
var expect = require('chai').expect;

jjv.defaultOptions.useDefault = true;
jjv.defaultOptions.checkRequired = true;
jjv.defaultOptions.removeAdditional = true;

describe("oneOf", function () {
  var schema = {
    type: 'object',
    properties: {
      types: {
        type: 'array',
        items: {
          oneOf: [
              { "$ref": "#/definitions/type1" },
              { "$ref": "#/definitions/type2" },
              { "$ref": "#/definitions/type3" },
              { "$ref": "#/definitions/type4" }
          ],
        },
        minItems: 2,
        uniqueItems: true
      }
    },
    required: ['types'],
    definitions: {
      type1: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            enum: ['type1']
          },
          prop1: {
            type: 'string'
          }
        },
        required: ['identifier', 'prop1']
      },
      type2: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            enum: ['type2']
          },
          prop2: {
            type: 'string'
          }
        },
        required: ['identifier', 'prop2']
      },
      type3: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            enum: ['type3']
          },
          prop3: {
            type: 'string'
          }
        },
        required: ['identifier', 'prop3']
      },
      type4: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            enum: ['type4']
          },
          prop1: {
            type: 'string'
          }
        },
        required: ['identifier', 'prop4']
      }
    }
  };

  var object = {
    types: [
      {
        identifier: 'type1',
        prop1: 'prop'
      },
      {
        identifier: 'type2',
        prop2: 'prop'
      },
      {
        identifier: 'type3',
        prop3: 'prop'
      },
      {
        identifier: 'type4',
        prop4: 'prop'
      }
    ]
  };

  it("oneOf without removal", function () {
    var res = jjv.validate(schema, object);
    console.log(res);
    expect(res).to.be.null;
  });

});
