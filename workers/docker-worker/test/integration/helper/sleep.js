/** Return promise that is resolved in `delay` ms */
module.exports = (delay) => {
  return new Promise((accept) => {
    setTimeout(accept, delay);
  });
};
