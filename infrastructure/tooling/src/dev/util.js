const { URL } = require('url');

exports.makePgUrl = ({ hostname, username, password, dbname }) => {
  const u = new URL('postgresql://');
  u.hostname = hostname;
  u.username = username;
  u.password = password;
  u.pathname = `/${dbname}`;
  // enable SSL without any identity checking (so basically encryption but no
  // prevention of MITM attacks)
  u.search = 'ssl=1';
  return u.toString();
};
