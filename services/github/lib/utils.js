var utils = module.exports = {};

/**
 * Compares a list of expressions and a list of values,
 * returning true if any possible combination is a match
 **/
utils.listContainsExpressions = function (expressions, values) {
  for (var i in expressions ) {
    let exp = RegExp(expressions[i], 'i');
    // just join values so that we don't have to compare multiple times
    if (exp.test(values.join(' '))) return true;
  }
  return false;
};

