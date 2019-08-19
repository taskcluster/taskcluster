const parseurl = require('parseurl');
const path = require('path');

/**
 * Redirect user to login page if not authenticated.
 */
module.exports = (req, res, next) => {
  if (!req.user) {
    res.redirect(path.join('/', parseurl(req).search || ''));
  } else {
    next();
  }
};
