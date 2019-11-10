const { normalizeScopeSet, scopeCompare } = require("./normalize");

exports.simplifyScopeExpression = scopeExpression => {
  let key = Object.keys(scopeExpression);
  if (Object.values(scopeExpression)[0].length === 1) {
    if (key.includes("AnyOf")) {
      return scopeExpression.AnyOf[0];
    } else if (key.includes("AllOf")) {
      return scopeExpression.AllOf[0];
    }
  }
  if (Object.keys(scopeExpression)[0].includes("AllOf")) {
    const values = Object.values(scopeExpression)[0];
    let arr = [];
    if (values.length > 1) {
      values.forEach(item => {
        if (item.AllOf !== undefined) {
          let realValues = Object.values(item)[0];
          realValues.forEach(item => {
            if (realValues !== null) {
              arr.push(item);
              arr.sort(scopeCompare);
              let normalized = normalizeScopeSet(arr);
              scopeExpression[key[0]] = normalized;
              return (scopeExpression);
            }
          });
        }
      });
    }
  }
  nestedScopes(scopeExpression);
  return scopeExpression;
};

const normalizeScope = scopeExpression => {
  const values = Object.values(scopeExpression)[0];
  let key = Object.keys(scopeExpression);
  if (key.includes("AllOf") || key.includes("AnyOf")) {
    values.sort(scopeCompare);
    let normalized = normalizeScopeSet(values);
    scopeExpression[key[0]] = normalized;
  }
};

const nestedScopes = scopeExpression => {
  const values = Object.values(scopeExpression)[0];
  if (typeof values[1] === "object") {
    Object.values(scopeExpression).forEach(value => {
      const newValue = value[1];
      const sorted = Object.values(newValue)[0].sort(scopeCompare);
      let normalized = normalizeScopeSet(sorted);
      newValue[Object.keys(newValue)[0]] = normalized;
    });
  } else {
    normalizeScope(scopeExpression);
  }
};
