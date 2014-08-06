// Tiny helper to always return a date 10 minutes in the future.
module.exports = function expires() {
  var d = new Date();
  d.setMinutes(d.getMinutes());
  return d;
}
