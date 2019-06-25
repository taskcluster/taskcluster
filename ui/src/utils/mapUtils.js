// Utilities to work with Map data type, to complement its prototype methods

/**
 * Looks up a key by value. If there are >1 keys with the
 * same value, it will return the first one it finds
 *
 * If nothing found, it return undefined
 *
 * @param map Map
 * @param value {any}
 * @returns key {any | undefined}
 */
exports.findKeyInMap = ({ map, value }) => {
  const found = Array.from(map).find(kv => kv[1] === value);

  return found ? found[0] : found;
};
