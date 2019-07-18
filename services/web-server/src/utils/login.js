/**
 * A function that returns a middleware that renders callback.ejs
 * and saves the session in a table so that the user is not logged out
 * when the server restarts.
 */
module.exports = (publicUrl) => async (request, response) => {
  response.render('callback', {
    user: request.user,
    publicUrl,
  });
};
