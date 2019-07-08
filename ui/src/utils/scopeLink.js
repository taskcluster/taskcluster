// Given a scope, if it starts with "assume:"
// then a link to the relevant role is returned
// else a link to the scope inspector is returned.
export default scope =>
  scope.startsWith('assume:')
    ? `/auth/roles/${encodeURIComponent(scope.replace('assume:', ''))}`
    : `/auth/scopes/${encodeURIComponent(scope)}`;
