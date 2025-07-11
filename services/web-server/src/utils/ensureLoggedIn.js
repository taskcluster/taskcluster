/**
 * Redirect user to a path if not authenticated. Defaults to /third-party.
 */
export default (path = '/third-party') => (req, res, next) => {
  if (!req.user) {
    res.redirect(`${path}${URL.parse(req.url, 'http://taskcluster')?.search || ''}`);
  } else {
    next();
  }
};
