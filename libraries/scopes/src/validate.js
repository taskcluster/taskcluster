const VALID_SCOPE = /^[\x20-\x7e]*$/;

/**
 * Determine whether a scope is valid.  Scopes must be strings of ASCII
 * characters 0x20-0x7e (printable characters, including space but no other
 * whitespace)
 */
exports.validScope = (scope) =>
  typeof scope == 'string' && VALID_SCOPE.test(scope);
