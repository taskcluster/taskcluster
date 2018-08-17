/**
 * Remove all specified keys from an object, no matter how deep they are.
 * The removal is done in place, so run it on a copy if you don't want
 * to modify the original object.
 * This function has no limit so circular objects will probably
 * crash the browser.
 */
const removeKeys = (obj, keys) => {
  let index;

  Object.keys(obj).forEach(prop => {
    // important check that this is objects own property
    // not from prototype prop inherited
    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
      switch (typeof obj[prop]) {
        case 'string':
          index = keys.indexOf(prop);

          if (index > -1) {
            // eslint-disable-next-line no-param-reassign
            delete obj[prop];
          }

          break;
        case 'object':
          index = keys.indexOf(prop);

          if (index > -1) {
            // eslint-disable-next-line no-param-reassign
            delete obj[prop];
          } else {
            removeKeys(obj[prop], keys);
          }

          break;
        default:
          break;
      }
    }
  });

  return obj;
};

export default removeKeys;
