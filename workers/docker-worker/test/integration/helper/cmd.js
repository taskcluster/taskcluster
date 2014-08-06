module.exports = function cmd() {
  var args = Array.prototype.slice.call(arguments);
  var out = ['/bin/bash', '-c'].concat(args.join(' && '))
  return out;
}
