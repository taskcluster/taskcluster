const {schema} = require('./schema.js');
const {Database} = require('taskcluster-lib-postgres');

exports.upgrade = async ({adminDbUrl, showProgress, usernamePrefix, toVersion, useDbDirectory}) => {
  await Database.upgrade({
    schema: schema({useDbDirectory}),
    showProgress,
    usernamePrefix,
    adminDbUrl,
    toVersion,
  });
};
