class Op {
  constructor({ operator, operand }) {
    this.operand = operand;
    this.operator = operator;
  }
}

Op.equal = Op.eq = Op['=='] = x => new Op({ operator: "=", operand: x });
Op.notEqual = Op.ne = Op['!='] = x => new Op({ operator: "<>", operand: x });
Op.greaterThan = Op.gt = Op['>'] = x => new Op({ operator: ">", operand: x });
Op.greaterThanOrEqual = Op.gte = Op['<='] = x => new Op({ operator: ">=", operand: x });
Op.lessThan = Op.lt = Op['<'] = x => new Op({ operator: "<", operand: x });
Op.lessThanOrEqual = Op.lte = Op['<='] = x => new Op({ operator: "<=", operand: x });

module.exports = Op;
