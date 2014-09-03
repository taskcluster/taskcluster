#!/usr/bin/env node
var browserify = require('browserify');
var path       = require('path');
var fs         = require('fs');

// Create a browserify bundle
var b = browserify();

// Add browser.js which will require client.js and add it to the window element
b.add(path.join(__dirname, '..', 'browser.js'));

// Open taskcluster-client.js and pipe bundle to it
var file = fs.createWriteStream(path.join(__dirname, '..', 'taskcluster-client.js'));
b.bundle().pipe(file);

// Write to stdout so we know what happened
console.log("Updated taskcluster-client.js");
