const { URL } = require('url');

// Generate a postgres connection URL suitable for use in the configuration and
// passing to taskcluster-lib-postgres.  Note that this will not work directly
// with node-postgres, as the `?ssl=1` option expects valid certificates, which
// Cloud SQL does not provide.
exports.makePgUrl = ({ hostname, username, password, dbname }) => {
  const u = new URL('postgresql://');
  u.hostname = hostname;
  u.username = username;
  u.password = password;
  u.pathname = `/${dbname}`;
  u.search = 'ssl=1';
  return u.toString();
};
