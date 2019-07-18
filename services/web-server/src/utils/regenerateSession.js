// Regenerate a sessionId given a request
// https://stackoverflow.com/a/26394156/6150432
module.exports = req => new Promise((resolve) => {
  const temp = req.session.passport;

  req.session.regenerate((err) => {
    // req.session.passport is now undefined
    req.session.passport = temp;
    req.session.save((err) => {
      resolve();
    });
  });
});
