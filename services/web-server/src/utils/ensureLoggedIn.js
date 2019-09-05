const parseurl = require('parseurl');

/**
 * Redirect user to a path if not authenticated. Defaults to /third-party.
 */
module.exports = (path = '/third-party') => (req, res, next) => {
  if (!req.user) {
    res.redirect(`${path}${parseurl(req).search || ''}`);
  } else {
    next();
  }
};
