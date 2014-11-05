'use strict';

var base = require('taskcluster-base');
var assert = require('assert');
var debug = require('debug');

var port = Number(process.env.PORT);

try {
	var clients = JSON.parse(process.env.CLIENTS);
	console.log('Parsed %d clients', clients.length)
} catch (e) {
	console.error(e, 'Error parsing CLIENTS environment variable');
	process.exit(1);
}

clients.forEach(function(c) {
	if (c.expiry) {
		if (c.expiry.indexOf('DATE:') == 0) {
			var d = new Date(Number(c.expiry.slice(5)));
			console.log('handled a date %s -> %s', c.expiry, d);
			c.expiry = d;
		}
	}
});

console.log('Starting mock server on port %d with clients:\n', port);
console.log(JSON.stringify(clients, null, 2));

var _server
base.testing.createMockAuthServer({
	port: port,
	clients: clients
}).then(function(server) {
	console.log('Started server');
	_server = server;
});

function bail() {
	console.log('Exiting cleanly');
	_server.terminate().then(function() {
		process.exit(0);
	}, function() {
		process.exit(-1);	
	});
}

process.on('SIGTERM', bail);
process.on('SIGINT', bail);

