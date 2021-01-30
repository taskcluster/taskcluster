module.exports = {
  ...require('./repo'),
  ...require('./tasks'),
  ...require('./git'),
  ...require('./docker'),
  ...require('./command'),
  ...require('./config'),
  ...require('./crates'),
  ...require('./npm'),
  ...require('./pypi'),
  ...require('./dockerflow'),
  ...require('./db'),
};
