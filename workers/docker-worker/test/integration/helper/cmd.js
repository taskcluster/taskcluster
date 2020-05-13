module.exports = function cmd() {
  var args = Array.prototype.slice.call(arguments);
  var out = ['/bin/sh', '-c'].concat(args.join(' && '));
  return out;
};
