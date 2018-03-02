module.exports = {
  // the second capturing group is used to catch a user's github username
  CLIENT_ID_PATTERN: /^([^\/]*\/[^\/]*)\/([^\/]*).*$/,
  // Encode manually mainly because encodeUriComponent fails to encode a
  // few characters that are not legal in a clientId
  encode: (str) => str
    .replace(/!/g, '!21')
    .replace(/[^A-Za-z0-9!@:.+|_-]/g, c => {
      const h = c.charCodeAt().toString(16).toUpperCase();

      return h.length === 2 ? `!${h}` : `!0${h}`;
    }),
  // Decoding:
  // 1. Replace ! with %
  // 2. Decode with decodeUriComponent (which converts %21 to !)
  decode: str => decodeURIComponent(str.replace(/!/g, '%')),
};
