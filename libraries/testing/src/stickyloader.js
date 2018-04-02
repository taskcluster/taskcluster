module.exports = (load) => {
  let overwrites = {};

  /* load, storing the loaded component */
  const wrapper = async (component, _overwrites) => {
    if (_overwrites) {
      throw new Error('Do not call stickyLoader with overwrites (a second argument)');
    }
    const value = await load(component, overwrites);
    overwrites[component] = value;
    return value;
  };

  /* "unstick" everything */
  wrapper.reset = () => {
    overwrites = {};
  };

  /* inject a dependency */
  wrapper.inject = (component, value) => {
    overwrites[component] = value;
  };

  return wrapper;
};
