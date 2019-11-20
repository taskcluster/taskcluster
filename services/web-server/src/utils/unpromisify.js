/**
 * Wrap an async `fn` in such a way that it can act as a function taking a callback
 * as its last argument.  That callback either gets cb(err) for errors, or cb(null, res)
 * or (if returnsArray is true) cb(null, ...res).  The resuting function has the
 * appropriate arity (one more than the input arity, to account for the 'done' argument)
 */
module.exports = (fn, {returnsArray} = {}) => {
  // eslint-disable-next-line no-unused-vars
  const call = (self, args) => {
    const done = args.pop();
    Promise.resolve(fn.apply(self, args)).then(
      returnsArray ? res => done.call(null, null, ...res) : res => done.call(null, null, res),
      err => done.call(null, err));
  };

  // preserve arity by generating code..
  const args = [...new Array(fn.length + 1)].map((_, i) => `arg${i}`);
  // eslint-disable-next-line no-eval
  return eval(`const x = function (${args}) { return call(this, [...arguments]); }; x`);
};
