const { decode } = require('./codec');

module.exports = (identity) => {
  let [strategy, encodedUserId] = identity.split('/');

  if (strategy === 'mozilla-auth0') {
    // Reverse the username appending, stripping the username.
    if (encodedUserId.startsWith('github|') || encodedUserId.startsWith('oauth2|firefoxaccounts|')) {
      encodedUserId = encodedUserId.replace(/\|[^|]*$/, '');
    }
  }

  return decode(encodedUserId);
};
