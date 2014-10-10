'use strict';

var fs = require('fs');
var apiData = require('./apis.js');

var output = process.env.OUTPUT;
if (!output) {
	console.error('ERROR: no output file specified, use OUTPUT environment variable');
	process.exit(1);
}

console.log('Writing output to %s', output);
fs.writeFileSync(output, JSON.stringify(apiData, null, 2));
console.log('Wrote output to %s', output);
