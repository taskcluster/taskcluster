import assert from 'assert';
import _ from 'lodash';

// A function that returns a middleware that renders callback.ejs
export default (publicUrl) => async (request, response) => {
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
