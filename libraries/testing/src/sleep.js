/** Return promise that is resolved in `delay` ms */
const sleep = function(delay) {
  return new Promise(function(accept) {
    setTimeout(accept, delay);
  });
};

module.exports = sleep;
