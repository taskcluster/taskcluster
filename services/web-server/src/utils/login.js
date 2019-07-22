// A function that returns a middleware that renders callback.ejs
module.exports = (publicUrl) => async (request, response) => {
  response.render('callback', {
    user: request.user,
    publicUrl,
  });
};
