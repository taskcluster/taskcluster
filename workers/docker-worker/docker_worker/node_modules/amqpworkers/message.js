/**
Generic message handler with built in support for object -> binary json.

@constructor
@param {Object} content for message (will be converted to json)
@param {Object} [options] for message (see amqplib #publish options)
*/
function Message(content, options) {
  // always default to the given value
  var buffer = content;

  options = options || {};

  // if its NOT a buffer then covert to JSON blob
  if (!Buffer.isBuffer(content)) {
    buffer = new Buffer(JSON.stringify(content));
    options.contentType = options.contentType || 'application/json';
  }

  return {
    options: options,
    buffer: buffer
  };
}

module.exports = Message;
