const {Database, Schema} = require('taskcluster-lib-postgres');

exports.upgrade = async ({adminDbUrl, showProgress, toVersion}) => {
  const schema = Schema.fromDbDirectory();

  await Database.upgrade({
    schema,
    showProgress,
    adminDbUrl,
    toVersion,
  });
};
