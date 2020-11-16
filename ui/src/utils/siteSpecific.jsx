export function siteSpecificVariables() {
  return {
    // omit TASKCLUSTER_ROOT_URL in DOCS_ONLY mode
    ...(window.env.DOCS_ONLY
      ? {}
      : { root_url: window.env.TASKCLUSTER_ROOT_URL }),
    ...(window.env.SITE_SPECIFIC || {}),
  };
}

export function siteSpecificVariable(v) {
  return siteSpecificVariables()[v];
}
