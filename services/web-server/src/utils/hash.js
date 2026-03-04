import crypto from 'crypto';

// Create a sha512 hash
export default t => {
  return crypto
    .createHash('sha512')
    .update(t, 'utf8')
    .digest('hex');
};
