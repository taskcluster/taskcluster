module.exports = function cmd() {
  let args = Array.prototype.slice.call(arguments);
  let out = ['/bin/sh', '-c'].concat(args.join(' && '));
  return out;
};
