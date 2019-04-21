/**
 * Encode/decode utilities targeted for client IDs.
 * Motivation: encodeUriComponent and decodeUriComponent
 * fails to encode/decode a few characters that are
 * not legal in a clientId.
 * */
module.exports = {
  encode: (str) => str
    .replace(/!/g, '!21')
    .replace(/[^A-Za-z0-9!@:.+|_-]/g, c => {
      const h = c.charCodeAt().toString(16).toUpperCase();

      return h.length === 2 ? `!${h}` : `!0${h}`;
    }),
  // 1. Replace ! with %
  // 2. Decode with decodeUriComponent (which converts %21 to !)
  decode: str => decodeURIComponent(str.replace(/!/g, '%')),
};
