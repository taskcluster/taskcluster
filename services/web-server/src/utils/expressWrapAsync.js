/**
 * Express lacks a good answer for how to handle the
 * async/await keywords in middlewares.
 */
export default fn =>
  (req, res, next) => {
    fn(req, res).then(next, next);
  };
