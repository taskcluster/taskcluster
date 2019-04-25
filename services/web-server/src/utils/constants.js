// The second capturing group is used to catch a user's github username
module.exports = {
  CLIENT_ID_PATTERN: /^([^\/]*\/[^\/]*)\/([^\/]*).*$/,
  LOGIN_PROVIDERS: {
    MOZILLA_AUTH0: 'MOZILLA_AUTH0',
    GITHUB_OAUTH2: 'GITHUB_OAUTH2',
  },
};
