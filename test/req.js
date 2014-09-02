var INPUT_URL = 'http://localhost:60022/log';
var OUTPUT_URL = 'http://localhost:60023/log';

module.exports.client = function client(method, url) {
	url = require('url').parse(url);
	url.method = method;
	return require('http').request(url);
}

module.exports.input = function input() {
	return module.exports.client('PUT', INPUT_URL);
}

module.exports.output = function output() {
	return module.exports.client('GET', OUTPUT_URL);
}
