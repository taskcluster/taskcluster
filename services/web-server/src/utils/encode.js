// Encode manually mainly because encodeUriComponent fails to encode a
// few characters that are not legal in a clientId
module.exports = (str) => str
  .replace(/!/g, '!21')
  .replace(/[^A-Za-z0-9!@:.+|_-]/g, c => {
    const h = c.charCodeAt().toString(16).toUpperCase();

    return h.length === 2 ? `!${h}` : `!0${h}`;
  });
