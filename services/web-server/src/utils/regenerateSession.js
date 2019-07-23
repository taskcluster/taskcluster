// Regenerate a sessionId given a request
module.exports = req => new Promise((resolve) => {
  const temp = req.session.passport;

  req.session.regenerate((err) => {
    // Passport adds a passport key to req.session. When req.session.regenerate runs,
    // req.session.passport becomes undefined because req.session is recreated.
    // The callback makes the necessary changes to make passport aware of the current user.
    // For more information, see https://stackoverflow.com/a/26394156/6150432
    req.session.passport = temp;
    req.session.save((err) => {
      resolve();
    });
  });
});
