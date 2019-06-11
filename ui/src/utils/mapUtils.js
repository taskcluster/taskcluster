// Utilities to work with Map data type, to complement its prototype methods

/**
 * Looks up a key by value. If there are >1 keys with the
 * same value, it will return the last one it finds
 *
 * @param map Map
 * @param value {any}
 * @returns key {any}
 */
exports.findKeyInMap = ({ map, value }) =>
  Array.from(map).reduce((acc, curr) => {
    if (curr.includes(value)) {
      return curr[0];
    }

    return null;
  }, []);
