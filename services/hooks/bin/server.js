#!/usr/bin/env node
var debug = require('debug')('hooks:bin:server');
var base = require('taskcluster-base');

/* Launch server */
var launch = function(profile) {
    debug("Launching with profile: %s", profile);

    // Load configuration
    var cfg = base.config({
        defaults:   require('../config/defaults'),
        profile:    require('../config/' + profile),
        filename:   'taskcluster-hooks'
    });

    // Start monitoring the process
    // create a queing service
    // create resources
    // create api router
    // create app
    var app = base.app({
        port:       Number(process.env.PORT || cfg.get('server:port')),
        env:        cfg.get('server:env'),
        forceSSL:   cfg.get('server:forceSSL'),
        trustProxy: cfg.get('server:trustProxy')
    });

    // create server
    debug("Launching server");
    return app.createServer();
};

if (!module.parent) {
    // Find configuration profile
    var profile = process.argv[2];
    if (!profile) {
        console.log("Usage: server.js [profile]");
        console.error("ERROR: No configuration profile is provided");
    }
    // Launch with given profile
    launch(profile).then(function() {
        debug("Launched server sucessfully");
    }).catch(function(err) {
        debug("Fauled to start server, err: %s, as JSON: %j", err, err, err.stack);
        process.exit(1);
    });
}

module.exports = launch;
