/**
 * Express lacks a good answer for how to handle the
 * async/await keywords in middlewares.
 *
 * Important: When throwing errors, `throw` without using `next`.
 * Calling `next` multiple times causes some really weird behavior.
 */
module.exports = fn =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
