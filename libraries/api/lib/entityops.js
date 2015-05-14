"use strict";

var util            = require('util');
var assert          = require('assert');
var _               = require('lodash');
var debug           = require('debug')('base:entity:keys');
var azure           = require('fast-azure-storage');
var azTableOps      = azure.Table.Operators;

/** Base class for all operators */
var Op = function(operand) {
  this.operand  = operand;
};

/** Operator string */
Op.prototype.operator = null;

/** This is an ordered or unordered comparison */
Op.prototype.ordered = null;

/******************** Ordering Relations ********************/

// Ordering relations
var ORDER_RELATIONS = [
  azTableOps.GreaterThan,
  azTableOps.GreaterThanOrEqual,
  azTableOps.LessThan,
  azTableOps.LessThanOrEqual
];

// Short hand for operators
ORDER_RELATIONS.forEach(function(operator) {
  // Defined class for operator
  var Class = function(operand) {
    Op.call(this, operand);
  };
  util.inherits(Class, Op);
  Class.prototype.operator = operator;
  Class.prototype.ordered = true;
  // Define function to create class instance
  Op[operator] = function(operand) {
    assert(operand !== undefined, "operand is required");
    return new Class(operand);
  };
});

/******************** Equivalence Relations ********************/

// Equivalence relations
var EQUIVALENCE_RELATIONS = [
  azTableOps.Equal,
  azTableOps.NotEqual
];

// Short hand for operators
EQUIVALENCE_RELATIONS.forEach(function(operator) {
  // Defined class for operator
  var Class = function(operand) {
    Op.call(this, operand);
  };
  util.inherits(Class, Op);
  Class.prototype.operator = operator;
  Class.prototype.ordered = false;
  // Define function to create class instance
  Op[operator] = function(operand) {
    assert(operand !== undefined, "operand is required");
    return new Class(operand);
  };
});

/******************** Short Hands ********************/

// Human readable short hand for operators
Op.equal                = Op.eq = Op['=='] = Op[azTableOps.Equal];
Op.notEqual             = Op.ne = Op['!='] = Op[azTableOps.NotEqual];
Op.greaterThan          = Op.gt = Op['>' ] = Op[azTableOps.GreaterThan];
Op.greaterThanOrEqual   = Op.ge = Op['>='] = Op[azTableOps.GreaterThanOrEqual];
Op.lessThan             = Op.lt = Op['<' ] = Op[azTableOps.LessThan];
Op.lessThanOrEqual      = Op.le = Op['<='] = Op[azTableOps.LessThanOrEqual];

// Export Op with all auxiliary functions
module.exports = Op;