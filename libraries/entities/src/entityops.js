const ops = {
  equal: x => ({ operator: '=', operand: x }),
  notEqual: x => ({ operator: '<>', operand: x }),
  greaterThan: x => ({ operator: '>', operand: x }),
  greaterThanOrEqual: x => ({ operator: '>=', operand: x }),
  lessThan: x => ({ operator: '<', operand: x }),
  lessThanOrEqual: x => ({ operator: '<=', operand: x }),
};

const shorthandOps = {
  eq: ops.equal,
  nq: ops.notEqual,
  gt: ops.greaterThan,
  gte: ops.greaterThanOrEqual,
  lt: ops.lessThan,
  lte: ops.lessThanOrEqual,
};

module.exports = {
  ...ops,
  ...shorthandOps,
};
