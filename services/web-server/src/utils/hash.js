const crypto = require('crypto');

// Create a sha512 hash
module.exports = t => {
  return crypto
    .createHash('sha512')
    .update(t, 'utf8')
    .digest('hex');
};
