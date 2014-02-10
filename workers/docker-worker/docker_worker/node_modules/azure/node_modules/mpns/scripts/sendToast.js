// Copyright Jeff Wilcox
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

var TEST_TITLE = 'Hi.';
var TEST_MESSAGE = 'This is a test.';

var   mpns = require('../lib/mpns')
    , fs = require('fs');

var args = process.argv;
args.shift();
var cmd = 'node ' + args.shift();

function help() {
	console.log('Node.js MPNS Module Test Toaster');
	console.log('Please provide the pushUri to a Microsoft Push Notification Service (MPNS) endpoint to a Windows Phone device.');
	console.log();
	console.log('Parameters:');
	console.log('    ' + cmd + ' pushUri [Message]');
	console.log();

	// Right now my implementation for auth push testing is specific to my key use practices.
	console.log('Authenticated push notification channels are supported with the appropriate environment variables:');
	console.log('    MPNS_CERT: Point to a certificate file.');
	console.log('    MPNS_CA: Point to a certificate authority or intermediate chain file.');
	console.log('    MPNS_KEY: Point to a private key file.');
	console.log();
	console.log('Or for authenticated push with a PKCS12 package format:');
	console.log('    MPNS_PFX: The PKCS12 file.');
	console.log('    MPNS_PASSPHRASE: The optional password for the PKCS12 file.')
}

if (args.length == 0) {
	return help();
}

var uri = args.shift();

if (uri.indexOf('http') !== 0) {
	console.log('The first parameter must be a URI.');
	return help();
}

var options = {
	text1: args.shift() || TEST_TITLE,
	text2: args.length > 0 ? args.join(' ') : TEST_MESSAGE
};

var authenticationReady = false;
var fileEncoding = undefined;
if (process.env.MPNS_CERT && process.env.MPNS_KEY) {
	options.cert = fs.readFileSync(process.env.MPNS_CERT, fileEncoding);
	options.key = fs.readFileSync(process.env.MPNS_KEY, fileEncoding);
	var ca = process.env.MPNS_CA;
	if (ca !== undefined) {
		options.ca = fs.readFileSync(ca, fileEncoding);
	}
	authenticationReady = true;
} else if (process.env.MPNS_PFX) {
	options.pfx = fs.readFileSync(process.env.MPNS_PFX, fileEncoding);
	var passphrase = process.env.MPNS_PASSPHRASE;
	if (passphrase !== undefined) {
		options.passphrase = passphrase;
	}
	authenticationReady = true;
}

if (uri.indexOf('https') == 0) {
	if (!authenticationReady) {
		throw new Error('Authenticated push channels are not currently supported by this test application unless environment variables are set properly.');
	} else {
		var keys = [];
		for (var k in mpns.Properties.ssl) {
			var key = mpns.Properties.ssl[k];
			if (options[key]) {
				keys.push(key);
			}
		}
		console.log('Authenticated push notification channel: ' + keys.join(', '));
	}
}

console.log('Sending a toast...');

mpns.sendToast(uri, options, function (err, result) {
	console.log(err ? 'Error' : 'OK');
	console.dir(err || result);
});
