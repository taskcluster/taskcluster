const { URL } = require('url');

exports.makePgUrl = ({ hostname, username, password, dbname }) => {
  const u = new URL('postgresql://');
  u.hostname = hostname;
  u.username = username;
  u.password = password;
  u.pathname = `/${dbname}`;
  return u.toString();
};
