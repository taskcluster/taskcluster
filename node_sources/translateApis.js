'use strict';
var fs = require('fs');
var apiData = require('./apis.js');

var output = process.env.OUTPUT;
if (!output) {
	console.error('ERROR: no output file specified, use OUTPUT environment variable');
	process.exit(1);
}

fs.writeFileSync(output, JSON.stringify(apiData, null, 2));
