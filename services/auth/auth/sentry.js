var api         = require('./v1');

api.declare({
  method:     'get',
  route:      '/sentry/:project/dsn',
  name:       'sentryDSN',
  input:      undefined,
  output:     'sentry-dsn-response.json#',
  deferAuth:  true,
  stability:  'stable',
  scopes:     [['auth:sentry:<project>']],
  title:      "Get DSN for Sentry Project",
  description: [
    "Get temporary DSN (access credentials) for a sentry project.",
    "The credentials returned can be used with any Sentry client for up to",
    "24 hours, after which the credentials will be automatically disabled.",
    "",
    "If the project doesn't exist it will be created, and assigned to the",
    "initial team configured for this component. Contact a Sentry admin",
    "to have the project transferred to a team you have access to if needed",
  ].join('\n')
}, async function(req, res) {
  let project = req.params.project;

  // Check scopes
  if (!req.satisfies({project})) {
    return;
  }

  let key = await this.sentryManager.projectDSN(project);

  return res.reply({
    project,
    dsn: key.dsn,
    expires: key.expires.toJSON(),
  });
});
