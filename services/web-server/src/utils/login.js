const assert = require('assert');
const _ = require('lodash');

// A function that returns a middleware that renders callback.ejs
module.exports = (publicUrl) => async (request, response) => {
  assert(request.user, 'Must have a user');
  assert(request.user.profile);
  assert(request.user.identityProviderId);
  assert(request.user.providerExpires);

  request.user.encodedProfile = new Buffer.from(JSON.stringify(request.user.profile)).toString('base64');

  response.render('callback', {
    user: request.user,
    publicUrl,
  });
};
