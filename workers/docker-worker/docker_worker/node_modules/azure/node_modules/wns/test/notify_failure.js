var notify = require('./notify.js')
	, nock = require('nock')
	, assert = require('assert')
	, fs = require('fs')
	, path = require('path')
	, vm = require('vm');

// normalize test APIs between TDD and BDD
if (!global.describe) {
	describe = suite;
	it = test;
}

// Set the WNS_RECORD environment variable to 1 to execute the tests against live WNS endpoints and record
// the HTTPS traffic in files under the nock directory.
// If the variable is not set (the default), the tests will execute against mocked HTTP responses saved previously 
// to the files under the nock directory.

var recordLiveSession = process.env.WNS_RECORD == 1;
var nockRecordingsDir = path.resolve(__dirname, 'nock');
var currentRecord = 0;
var validChannel = 'https://bn1.notify.windows.com/?token=AgUAAACQRWJECxiyMVoNBsJefU%2bZypA7bASncWnSeSP9WA2zBXKnyb1%2fWUCg%2bTr7%2fspFEBK0b25eCDYgxdjVq%2bCoqqz6P68y6uLsnlnDtRbig9dzDWM30D5BNI7PmG7H7vsgCSU%3d'
var invalidChannel = 'https://bn1.notify.windows.com/?token=invalidToken';
var options = {
	client_id: 'ms-app://s-1-15-2-3004590818-3540041580-1964567292-460813795-2327965118-1902784169-2945106848',
	client_secret: 'N3icDsX5JXArJJR6AdTQZ86RITXQnMmA',
};
var invalidOptions = {
	client_id: 'foo',
	client_secret: 'bar'
};
var validTile = "<tile><visual><binding template=\"TileSquareBlock\"><text id=\"1\">http://textParam1.com</text><text id=\"2\">http://textParam2.com</text></binding></visual></tile>";
var invalidTile = "this is an invalid tile";

if (recordLiveSession) {
	console.log('Executing tests against live endpoints and recording the traffic');
	// capture HTTP traffic against live endpoints
	nock.recorder.rec(true);
}

var callback = function (error, result, done, nockFile, mockScopes, validation) {
	try {
		validation(error, result);

		if (recordLiveSession) {
			// save recorded traffic to a file under the nock directory

			var code = [ 'exports.setupMockScopes = function (nock) { var scopes = []; var scope; '];
			while (currentRecord < nock.recorder.play().length) {
				code.push('scope = ' + nock.recorder.play()[currentRecord++]);
				code.push('scopes.push(scope);')
			};
			code.push('return scopes; };');
			fs.writeFileSync(nockFile, code.join(''));
		}						
		else
			// validate requests against all mocked endpoints have been performed
			mockScopes.forEach(function (scope) { scope.done(); });

		done();
	}
	catch (e) {
		console.log(e);
		done(e);
	}
};

describe('sending notification to an invalid channel with notify.js', function () {
	it('fails', function (done) {
		var nockFile = path.resolve(nockRecordingsDir, 'InvalidChannel-failure.js');
		var mockScopes;
		if (!recordLiveSession) 
			// load mock HTTP traffic captured previously
			mockScopes = require(nockFile).setupMockScopes(nock);		

		var validation = function (error, result) {
			assert.equal(typeof result, 'undefined', 'There is no result');
			assert.equal(typeof error, 'object', 'There is an error');
			assert.equal(error.statusCode, 404, 'The HTTP response status code is an expected 404');
			assert.equal(typeof error.newAccessToken, 'undefined', 'Access token is not propagated');
		};

		var wns = notify.createWnsContext(options.client_secret, options.client_id);
		wns.sendTileSquareBlock(invalidChannel, 'http://textParam1.com', 'http://textParam2.com', {
			success: function (result) {
				callback(null, result, done, nockFile, mockScopes, validation);
			},
			error: function (error) {
				callback(error, undefined, done, nockFile, mockScopes, validation);	
			}
		});
	});
});

describe('using invalid application credentials with notify.js', function () {
	it('fails', function (done) {
		var nockFile = path.resolve(nockRecordingsDir, 'InvalidCredentials-failure.js');
		var mockScopes;
		if (!recordLiveSession) 
			// load mock HTTP traffic captured previously
			mockScopes = require(nockFile).setupMockScopes(nock);		

		var validation = function (error, result) {
			assert.equal(typeof result, 'undefined', 'There is no result');
			assert.equal(typeof error, 'object', 'There is an error');
			assert.equal(error.statusCode, 400, 'The HTTP response status code is an expected 400');
			assert.equal(typeof error.newAccessToken, 'undefined', 'Access token had not been obtained');
			assert.equal(typeof error.innerError, 'string', 'OAuth response body is present')
		};

		var wns = notify.createWnsContext(invalidOptions.client_secret, invalidOptions.client_id);
		wns.sendBadge(validChannel, 'alert', {
			success: function (result) {
				callback(null, result, done, nockFile, mockScopes, validation);
			},
			error: function (error) {
				callback(error, undefined, done, nockFile, mockScopes, validation);	
			}
		});
	});
});
