let utils = module.exports = {};

/**
 * Compares a list of expressions and a list of values,
 * returning true if any possible combination is a match
 **/
utils.listContainsExpressions = function (expressions, values) {
  for (let expression of expressions) {
    let exp = RegExp(expression, 'i');
    // just join values so that we don't have to compare multiple times
    if (exp.test(values.join(' '))) { 
      return true;
    };
  }
  return false;
};

