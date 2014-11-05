'use strict';

var base = require('taskcluster-base');
var assert = require('assert');
var debug = require('debug')('mock-server-for-python');

var port = Number(process.env.PORT);

try {
	var clients = JSON.parse(process.env.CLIENTS);
	debug('Parsed %d clients', clients.length);
} catch (e) {
	console.error(e, 'Error parsing CLIENTS environment variable');
	process.exit(1);
}

clients.forEach(function(c) {
	if (c.expiry) {
		if (c.expiry.indexOf('DATE:') == 0) {
			var d = new Date(Number(c.expiry.slice(5)));
			debug('handled a date %s -> %s', c.expiry, d);
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
  debug('Started server');
	_server = server;
});

function bail() {
  debug('Stopping server');
	_server.terminate().then(function() {
		process.exit(0);
	}, function(err) {
    console.error(err, 'Error stopping server, exiting uncleanly');
		process.exit(-1);	
	});
}

process.on('SIGTERM', bail);
process.on('SIGINT', bail);

