// Variables that <SiteSpecific> cards may reference as %name%.
//
// WARNING: any changes to this list should be reflected in
//   ui/docs/manual/deploying/ui.mdx
// See that file for descriptions of each variable.
export const SITE_SPECIFIC_VARS = new Set([
  'root_url',
  'github_app_url',
  'tutorial_worker_pool_id',
  'notify_email_sender',
  'notify_matrix_bot_name',
  'notify_slack_bot_name',
  'cloud_credentials_docs_url',
]);

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

export function substituteSiteSpecific(
  text,
  variables = siteSpecificVariables()
) {
  return text.replace(/%([a-zA-Z0-9_]+)%/g, (_, name) => {
    if (!SITE_SPECIFIC_VARS.has(name)) {
      throw new Error(`No such site-specific variable ${name}`);
    }

    return variables[name] || '';
  });
}
