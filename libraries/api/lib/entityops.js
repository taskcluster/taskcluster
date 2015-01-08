"use strict";

var util            = require('util');
var assert          = require('assert');
var _               = require('lodash');
var debug           = require('debug')('base:entity:keys');

/** Base class for all operators */
var Op = function(operator, operand) {
  this.operator = operator;
  this.operand  = operand;
};

/** Construct filter for given property with type */
Op.prototype.filter = function(type, property, queryBuilder) {
  throw new Error("Not implementing in abstract class");
};

/******************** Ordering Relations ********************/

// Ordering relations
var ORDER_RELATIONS = [
  '>', '>=',
  '<', '<='
];

/** Class for ordering operators */
var OrderOp = function(op, operand) {
  assert(ORDER_RELATIONS.indexOf(op) !== -1,        "Invalidate operator!");
  assert(operand !== undefined,                     "operand is required");
  Op.call(this, op, operand);
};

util.inherits(OrderOp, Op);

OrderOp.prototype.filter = function(type, property, queryBuilder) {
  if (!type.isOrdered) {
    throw new Error("Type for '" + property + "' does not support the " +
                    "operator: '" + this.operator + "'");
  }
  // Serialize
  var target = {};
  type.serialize(target, this.operand);

  // For ordered data types there should only be one key/value pair
  assert(_.size(target) === 1, "isOrdered should only be supported by types " +
                               "serialized to a single key/value pair");

  // Construct constraints
  _.forIn(target, function(value, key) {
    queryBuilder(key, this.operator, value);
  }, this);
};

/******************** Equivalence Relations ********************/

// Equivalence relations
var EQUIVALENCE_RELATIONS = [
  '==', '!=',
];

/** Class for simple equivalence operators */
var EquivOp = function(op, operand) {
  assert(EQUIVALENCE_RELATIONS.indexOf(op) !== -1,  "Invalidate operator!");
  assert(operand !== undefined,                     "operand is required");
  Op.call(this, op, operand);
};
util.inherits(EquivOp, Op);

EquivOp.prototype.filter = function(type, property, queryBuilder) {
  if (!type.isComparable) {
    throw new Error("Type for '" + property + "' does not support the " +
                    "operator: '" + this.operator + "'");
  }
  // Serialize
  var target = {};
  type.serialize(target, this.operand);

  // Construct constraints
  _.forIn(target, function(value, key) {
    queryBuilder(key, this.operator, value);
  }, this);
};

/******************** Short Hands ********************/

// Short hand for operators
ORDER_RELATIONS.forEach(function(op) {
  Op[op] = function(operand) {
    return new OrderOp(op, operand);
  };
});
EQUIVALENCE_RELATIONS.forEach(function(op) {
  Op[op] = function(operand) {
    return new EquivOp(op, operand);
  };
});

// Human readable short hand for operators
Op.equal                = Op.eq = Op['=='];
Op.notEqual             = Op.ne = Op['!='];
Op.greaterThan          = Op.gt = Op['>' ];
Op.greaterThanOrEqual   = Op.ge = Op['>='];
Op.lessThan             = Op.lt = Op['<' ];
Op.lessThanOrEqual      = Op.le = Op['<='];

// Export Op with all auxiliary functions
module.exports = Op;