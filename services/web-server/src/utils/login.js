/**
 * A function that returns a middleware that renders callback.ejs
 * and saves the session in a table so that the user is not logged out
 * when the server restarts.
 */
module.exports = (publicUrl, Session) => async (request, response) => {
  await Session.create({
    sessionId: request.session.id,
    sessionValue: {
      identityProviderId: request.user.identityProviderId,
      identity: request.user.identity,
    },
    expires: new Date(request.user.providerExpires),
  }, true);

  response.render('callback', {
    user: request.user,
    publicUrl,
  });
};
