// Given a scope, if it starts with "assume:"
// then a link to the relevant role is returned
// else a link to the scope inspector is returned.
exports.scopeLink = scope =>
  scope.startsWith('assume:')
    ? `/auth/roles/${encodeURIComponent(scope.replace('assume:', ''))}`
    : `/auth/scopes/${encodeURIComponent(scope)}`;

// Given a scope, this utility returns a string with the special characters
// wrapped in <strong /> elements to provide more emphasis.
// Note: dangerouslySetInnerHTML will be required to render the string as jsx
exports.formatScope = scope =>
  scope.replace(/^assume:|\*$|<..>/g, match => `<strong>${match}</strong>`);
