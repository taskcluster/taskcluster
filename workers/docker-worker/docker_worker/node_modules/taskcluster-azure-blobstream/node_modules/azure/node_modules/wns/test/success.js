var wns = require('../lib/wns.js')
	, nock = require('nock')
	, assert = require('assert')
	, fs = require('fs')
	, path = require('path')
	, vm = require('vm')
	, templateSpecs = require('./templates.js').specs;

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
var channel = 'https://bn1.notify.windows.com/?token=AgYAAACFGdWBiRCTypHebfvngI7DuNBXWuGjdiczDOZ7bSgkbCRrD2M1b10CpzCmipzknHbU4nLzapQbooXzJ%2fVwHAfSl%2fWMk8OsetohEVMlsIicoLP99rDg7g2AdENA99DZoAU%3d'
var options = {
	client_id: 'ms-app://s-1-15-2-145565886-1510793020-2797717260-1526195933-3912359816-44086043-2211002316',
	client_secret: 'FF9yfJLxSH3uI32wNKGye643bAZ4zBz7',
};

if (recordLiveSession) {
	console.log('Executing tests against live endpoints and recording the traffic');
	// capture HTTP traffic against live endpoints
	nock.recorder.rec(true);
}

describe('wns.sendTile', function () {
	it('succeeds', function (done) {
		var nockFile = path.resolve(nockRecordingsDir, 'sendTile-success.js');
		var mockScopes;
		if (!recordLiveSession) 
			// load mock HTTP traffic captured previously
			mockScopes = require(nockFile).setupMockScopes(nock);		

		var customOptions = { lang: 'en-us' };
		for (var i in options) 
			customOptions[i] = options[i];

		wns.sendTile(
			channel, 
			wns.createTileSquareText04Binding('Sample text 1'),
			{ type: 'TileWideText03', text1: 'Sample wide text 2'},
			customOptions,
			function (error, result) {
				callback(error, result, done, nockFile, mockScopes);
			}
		);
	});
});

describe('wns.sendToast', function () {
	it('succeeds', function (done) {
		var nockFile = path.resolve(nockRecordingsDir, 'sendToast-success.js');
		var mockScopes;
		if (!recordLiveSession) 
			// load mock HTTP traffic captured previously
			mockScopes = require(nockFile).setupMockScopes(nock);		

		var customOptions = { lang: 'en-us', audio: { src: 'Alarm', loop: true } };
		for (var i in options) 
			customOptions[i] = options[i];

		wns.sendToast(
			channel, 
			wns.createToastText01Binding('Sample text 4'),
			{ type: 'ToastText02', text1: 'Sample text1', text2: 'Sample text 5'},
			customOptions,
			function (error, result) {
				callback(error, result, done, nockFile, mockScopes);
			}
		);
	});
});

var callback = function (error, result, done, nockFile, mockScopes) {
	try {
		assert.ifError(error);
		assert.equal(typeof result, 'object', 'Result is an object');
		assert.equal(typeof result.newAccessToken, 'string', 'New accessToken was obtained');
		assert.equal(result.statusCode, 200, 'WNS response is HTTP 200');
		assert.equal(typeof result.headers, 'object', 'HTTP response headers are present in the result');
		assert.equal(result.headers['x-wns-notificationstatus'], 'received', 'Notification was received by WNS');

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

for (var item in templateSpecs) {
	(function () {
		var templateName = item;
		describe('wns.send' + item, function () {
			it('succeeds', function (done) {

				var nockFile = path.resolve(nockRecordingsDir, templateName + '-success.js');

				// construct parameter list

				var params = [ channel ];

				var numberOfTextFields = templateSpecs[templateName][0] * 2 + templateSpecs[templateName][1];
				for (var i = 0; i < numberOfTextFields; i++)
					params.push('http://textParam' + (i + 1) + '.com');

				params.push(options);
				var mockScopes;
				params.push(function (error, result) {
					callback(error, result, done, nockFile, mockScopes);
				});

				var initiateNotification = function () {
					if (!recordLiveSession) 
						// load mock HTTP traffic captured previously
						mockScopes = require(nockFile).setupMockScopes(nock);

					wns['send' + templateName].apply(wns, params);
				};

				if (recordLiveSession) {
					// accessing real endpoints must be throttled otherwise we will get dropped notifications;
					// send one notification every 1 second; it is slow but better than recording manually one test at a time

					setTimeout(initiateNotification, 2000);
					// delay += 2000;
				}
				else 
					initiateNotification();
			});
		});
	})();
}

describe('wns.sendBadge', function () {
	it('succeeds', function (done) {
		var nockFile = path.resolve(nockRecordingsDir, 'Badge-success.js');
		var mockScopes;
		if (!recordLiveSession) 
			// load mock HTTP traffic captured previously
			mockScopes = require(nockFile).setupMockScopes(nock);		

		wns.sendBadge(channel, 'alert', options, function (error, result) {
			callback(error, result, done, nockFile, mockScopes);
		});
	});
});


describe('wns.sendRaw', function () {
	it('succeeds', function (done) {
		var nockFile = path.resolve(nockRecordingsDir, 'Raw-success.js');
		var mockScopes;
		if (!recordLiveSession) 
			// load mock HTTP traffic captured previously
			mockScopes = require(nockFile).setupMockScopes(nock, mockScopes);		

		wns.sendRaw(channel, "abc", options, function (error, result) {
			callback(error, result, done, nockFile, mockScopes);
		});
	});
});

describe('wns.send', function () {
	it('succeeds', function (done) {
		var nockFile = path.resolve(nockRecordingsDir, 'Send-success.js');
		var mockScopes;
		if (!recordLiveSession) 
			// load mock HTTP traffic captured previously
			mockScopes = require(nockFile).setupMockScopes(nock, mockScopes);		

		wns.send(channel, "<tile><visual><binding template=\"TileSquareBlock\"><text id=\"1\">http://textParam1.com</text><text id=\"2\">http://textParam2.com</text></binding></visual></tile>", 
			'wns/tile', options, function (error, result) {
			callback(error, result, done, nockFile, mockScopes);
		});
	});
});

describe('wns.sendToastText01 with audio and toast options', function () {
	it('succeeds', function (done) {
		var nockFile = path.resolve(nockRecordingsDir, 'SendToastText01WithAudioAndToastOptions-success.js');
		var mockScopes;
		if (!recordLiveSession) 
			// load mock HTTP traffic captured previously
			mockScopes = require(nockFile).setupMockScopes(nock, mockScopes);		

		var options1 = {
			client_id: options.client_id,
			client_secret: options.client_secret,
			audio: {
				src: 'Alarm',
				silent: false,
				loop: true
			},
			launch: 'some random parameter passed to the application',
			duration: 'long'
		}

		wns.sendToastText01(channel, 'A toast!', options1, function (error, result) {
			callback(error, result, done, nockFile, mockScopes);
		});
	});
});

describe('wns.sendToastText01 with non-string parameters', function () {
	it('succeeds', function (done) {
		var nockFile = path.resolve(nockRecordingsDir, 'SendToastText01WithAudioAndToastOptions-success.js');
		var mockScopes;
		if (!recordLiveSession) 
			// load mock HTTP traffic captured previously
			mockScopes = require(nockFile).setupMockScopes(nock, mockScopes);		

		var options1 = {
			client_id: options.client_id,
			client_secret: options.client_secret,
			audio: {
				src: 'Alarm',
				silent: false,
				loop: true
			},
			launch: 'some random parameter passed to the application',
			duration: 'long'
		}

		var params = {
			text1: {
				toString: function () {
					return 'A toast!';
				}
			}
		}

		wns.sendToastText01(channel, params, options1, function (error, result) {
			callback(error, result, done, nockFile, mockScopes);
		});
	});
});