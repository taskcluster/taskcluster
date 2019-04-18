/**
 * A utility to avoid using try catch.
 * Nesting code is not pretty.
 * */
module.exports = async promise => {
  try {
    const result = await promise;

    return [null, result];
  } catch (e) {
    return [e, null];
  }
};
