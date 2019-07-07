const scopeRedirect = scope =>
  scope.startsWith('assume:')
    ? `/auth/roles/${encodeURIComponent(scope.replace('assume:', ''))}`
    : `/auth/scopes/${encodeURIComponent(scope)}`;

export default scopeRedirect;