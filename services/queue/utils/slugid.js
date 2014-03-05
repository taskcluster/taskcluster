var uuid = require('uuid');

/** Encode uuid as a short 22 byte slug */
exports.encode = function(uuid_) {
  var bytes   = uuid.parse(uuid_);
  var base64  = (new Buffer(bytes)).toString('base64');
  var slug = base64
              .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
              .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
              .replace(/=/g,  '');  // Drop '==' padding
  return slug;
};

/** Decode 22 byte slug to uuid */
exports.decode = function(slug) {
  var base64 = slug
                  .replace(/-/g, '+')
                  .replace(/_/g, '/')
                  + '==';
  return uuid.unparse(new Buffer(base64, 'base64'));
};

/** Generate a v4 (random) uuid and encode it to a slug */
exports.v4 = function() {
  var bytes   = uuid.v4(null, new Buffer(16));
  var base64  = bytes.toString('base64');
  var slug = base64
              .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
              .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
              .replace(/=/g,  '');  // Drop '==' padding
  return slug;
};
