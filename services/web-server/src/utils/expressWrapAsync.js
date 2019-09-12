/**
 * Express lacks a good answer for how to handle the
 * async/await keywords in middlewares.
 */
module.exports = fn =>
  (req, res, next) => {
    fn(req, res).then(next, next);
  };
