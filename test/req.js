var INPUT_URL = 'http://localhost:60022/log';
var OUTPUT_URL = 'http://localhost:60023/log/7_3HoMEbQau1Qlzwx-JZgg';

module.exports.client = function client(method, url, opts) {
	url = require('url').parse(url);
	url.method = method;

  if (opts) {
    for (var key in opts) url[key] = opts[key];
  }

	return require('http').request(url);
}

module.exports.input = function input(opts) {
	return module.exports.client('PUT', INPUT_URL, opts);
}

module.exports.output = function output(opts) {
	return module.exports.client('GET', OUTPUT_URL, opts);
}
