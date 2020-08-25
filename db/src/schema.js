const path = require('path');
const fs = require('fs');
const { Schema } = require('taskcluster-lib-postgres');

exports.schema = ({ useDbDirectory } = {}) => {
  // using the DB directory is a bit slower (YAML parsing is slow) so we prefer to load the
  // generated schema in production, but load the DB directory when running tests.
  if (useDbDirectory) {
    return Schema.fromDbDirectory(path.join(__dirname, '..'));
  } else {
    const json = fs.readFileSync(path.join(__dirname, '../../generated/db-schema.json'));
    const serializable = JSON.parse(json);
    return Schema.fromSerializable(serializable);
  }
};
