var rest = require('superagent');
var _ = require('underscore');
var crypto = require('crypto');
var qs = require('querystring');

function KeenApi(config) {
	if (!config) {
		throw new Error("The 'config' parameter must be specified and must be a JS object.");
	}
	if (!config.projectId) {
		throw new Error("The 'config' object must contain a 'projectId'.");
	}

	this.projectId = config.projectId;
	this.writeKey = config.writeKey;
	this.readKey = config.readKey;
	this.masterKey = config.masterKey;
	this.baseUrl = config.baseUrl || 'https://api.keen.io/';
	this.apiVersion = config.apiVersion || '3.0';

	var baseUrl = this.baseUrl;
	var apiVersion = this.apiVersion;

	var request = {
		get: function(apiKey, path, callback) {
			rest
				.get(baseUrl + apiVersion + path)
				.set('Authorization', apiKey)
				.end(function(err, res) {
					processResponse(err, res, callback);
				});
		},
		post: function(apiKey, path, data, callback) {
			rest
				.post(baseUrl + apiVersion + path)
				.set('Authorization', apiKey)
				.set('Content-Type', 'application/json')
				.send(data || {})
				.end(function(err, res) {
					processResponse(err, res, callback);
				});
		},
		del: function(apiKey, path, callback) {
			rest
				.del(baseUrl + apiVersion + path)
				.set('Authorization', apiKey)
				.set('Content-Length', 0)
				.end(function(err, res) {
					processResponse(err, res, callback);
				});
		}
	};

	// Handle logic of processing response, including error messages
	// The error handling should be strengthened over time to be more meaningful and robust
	function processResponse(err, res, callback) {
		callback = callback || function() {};

		if (res && !res.ok && !err) {
			var is_err = res.body && res.body.error_code;
			err = new Error(is_err ? res.body.message : 'Unknown error occurred');
			err.code = is_err ? res.body.error_code : 'UnknownError';
		}

		if (err) return callback(err);
		return callback(null, res.body);
	}

	// Public Methods

	this.projects = {
		list: function(callback) {
			request.get(this.masterKey, '/projects', callback);
		},
		view: function(projectId, callback) {
			request.get(this.masterKey, '/projects/' + projectId, callback);
		}
	};

	this.events = {
		list: function(projectId, callback) {
			request.get(this.masterKey, '/projects/' + projectId + '/events', callback);
		},
		insert: function(projectId, events, callback) {
			events = events || [];
			var data = {};
			events.forEach(function(event) {
				var collection = event.collection;
				if (typeof data[collection] == 'undefined') {
					data[collection] = [];
				}
				var item = (event.data || {});
				if (typeof event.keen == 'object') {
					item.keen = event.keen;
				}
				data[collection].push(item);
			});
			request.post(this.writeKey, '/projects/' + projectId + '/events', data, callback);
		}
	};

	this.properties = {
		view: function(projectId, collection, property, callback) {
			request.get(this.masterKey, '/projects/' + projectId + '/events/' + collection + '/properties/' + property, callback);
		},
		remove: function(projectId, collection, property, callback) {
			request.del(this.masterKey, '/projects/' + projectId + '/events/' + collection + '/properties/' + property, callback);
		}
	};

	this.collections = {
		view: function(projectId, collection, callback) {
			request.get(this.masterKey, '/projects/' + projectId + '/events/' + collection, callback);
		},
		remove: function(projectId, collection, callback) {
			request.del(this.masterKey, '/projects/' + projectId + '/events/' + collection, callback);
		}
	};

	this.addEvent = function(eventCollection, event, callback) {
		if (!this.writeKey) {
			var errorMessage = "You must specify a non-null, non-empty 'writeKey' in your 'config' object when calling keen.configure()!";
			var error = new Error(errorMessage);
			if (callback) {
				callback(error);
			} else {
				throw error;
			}
			return;
		}

		request.post(this.writeKey, "/projects/" + this.projectId + "/events/" + eventCollection, event, callback);
	};

	this.request = function(method, keyType, path, params, callback) {
		method = typeof method === 'string' && method.toLowerCase();
		keyType += 'Key';
		callback = callback || (typeof params === 'function') && params;

		if (typeof path === 'string') {
			path = '/projects/' + this.projectId + '/' + path.replace(/^\//,'');
		} else {
			throw new Error('\'path\' must be a string.');
		}

		if (params && typeof params !== 'function') {
			path += '?' + qs.stringify(params);
		}

		if ( ! request.hasOwnProperty(method)) {
			throw new Error('Method must be of type: GET/POST/DEL');
		}

		if (!this.hasOwnProperty(keyType)) {
			throw new Error('Key must be of type: master/write/read');
		}

		if (!this[keyType]) {
			throw new Error('You must specify a nun-null, non-empty \'' + keyType + '\' in your config object.');
		}

		if(method === 'post') {
			return request.post(this[keyType], path, params, callback);
		}

		request[method](this[keyType], path, callback);
	};

	this.addEvents = function(events, callback) {
		if (!this.writeKey) {
			var errorMessage = "You must specify a non-null, non-empty 'writeKey' in your 'config' object when calling keen.configure()!";
			var error = new Error(errorMessage);
			if (callback) {
				callback(error);
			} else {
				throw error;
			}
			return;
		}

		request.post(this.writeKey, "/projects/" + this.projectId + "/events", events, callback);
	};
}

function configure(config) {
	return new KeenApi(config);
}

function encryptScopedKey(apiKey, options) {
	var iv = crypto.randomBytes(16);
	var cipher = crypto.createCipheriv("aes-256-cbc", apiKey, iv);
	var jsonOptions = JSON.stringify(options);
	var encryptOutput1 = cipher.update(jsonOptions, "utf8", "hex");
	var encryptOutput2 = cipher.final("hex");
	var ivPlusEncrypted = iv.toString("hex") + encryptOutput1 + encryptOutput2;
	return ivPlusEncrypted;
}

function decryptScopedKey(apiKey, scopedKey) {
	var hexedIv = scopedKey.substring(0, 32);
	var hexedCipherText = scopedKey.substring(32, scopedKey.length);
	var iv = new Buffer(hexedIv, "hex");
	var cipherText = new Buffer(hexedCipherText, "hex");
	var decipher = crypto.createDecipheriv("aes-256-cbc", apiKey, iv);
	var decryptOutput1 = decipher.update(cipherText);
	var decryptOutput2 = decipher.final();
	var decrypted = decryptOutput1 + decryptOutput2;
	return JSON.parse(decrypted);
}

module.exports = {
	configure: configure,
	encryptScopedKey: encryptScopedKey,
	decryptScopedKey: decryptScopedKey
};
