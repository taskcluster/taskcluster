exports.patternMatch = (pattern, scope) => {
  if (scope === pattern) {
    return true;
  }
  if (/\*$/.test(pattern)) {
    return scope.indexOf(pattern.slice(0, -1)) === 0;
  }
  return false;
};
