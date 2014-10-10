'use strict';

var output = process.env.OUTPUT;
if (!output) {
	console.error('ERROR: no output file specified, use OUTPUT environment variable');
	process.exit(1);
}

var fs = require('fs');
console.log('Reading API configuration');
var apiData = require('./apis.js');
console.log('Configuration read, writing output to %s', output);
fs.writeFileSync(output, JSON.stringify(apiData, null, 2));
console.log('Wrote output to %s', output);
