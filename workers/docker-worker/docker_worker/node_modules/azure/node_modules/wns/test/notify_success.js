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

var templateSpecs = {
    TileSquareBlock: [0, 2],
    TileSquareText01: [0, 4],
    TileSquareText02: [0, 2],
    TileSquareText03: [0, 4],
    TileSquareText04: [0, 1],
    TileWideText01: [0, 5],
    TileWideText02: [0, 9],
    TileWideText03: [0, 1],
    TileWideText04: [0, 1],
    TileWideText05: [0, 5],
    TileWideText06: [0, 10],
    TileWideText07: [0, 9],
    TileWideText08: [0, 10],
    TileWideText09: [0, 2],
    TileWideText10: [0, 9],
    TileWideText11: [0, 10],
    TileSquareImage: [1, 0],
    TileSquarePeekImageAndText01: [1, 4],
    TileSquarePeekImageAndText02: [1, 2],
    TileSquarePeekImageAndText03: [1, 4],
    TileSquarePeekImageAndText04: [1, 1],
    TileWideImage: [1, 0],
    TileWideImageCollection: [5, 0],
    TileWideImageAndText01: [1, 1],
    TileWideImageAndText02: [1, 2],
    TileWideBlockAndText01: [0, 6],
    TileWideBlockAndText02: [0, 3],
    TileWideSmallImageAndText01: [1, 1],
    TileWideSmallImageAndText02: [1, 5],
    TileWideSmallImageAndText03: [1, 1],
    TileWideSmallImageAndText04: [1, 2],
    TileWideSmallImageAndText05: [1, 2],
    TileWidePeekImageCollection01: [5, 2],
    TileWidePeekImageCollection02: [5, 5],
    TileWidePeekImageCollection03: [5, 1],
    TileWidePeekImageCollection04: [5, 1],
    TileWidePeekImageCollection05: [6, 2],
    TileWidePeekImageCollection06: [6, 1],
    TileWidePeekImageAndText01: [1, 1],
    TileWidePeekImageAndText02: [1, 5],
    TileWidePeekImage01: [1, 2],
    TileWidePeekImage02: [1, 5],
    TileWidePeekImage03: [1, 1],
    TileWidePeekImage04: [1, 1],
    TileWidePeekImage05: [2, 2],
    TileWidePeekImage06: [2, 1],
    ToastText01: [0, 1],
    ToastText02: [0, 2],
    ToastText03: [0, 2],
    ToastText04: [0, 3],
    ToastImageAndText01: [1, 1],
    ToastImageAndText02: [1, 2],
    ToastImageAndText03: [1, 2],
    ToastImageAndText04: [1, 3]
};

var callback = function (error, result, done, nockFile, mockScopes) {
    try {
        assert.ifError(error);
        assert.equal(typeof result, 'object', 'Result is an object');
        assert.equal(typeof result.newAccessToken, 'undefined', 'New accessToken was not propagated');
        assert.equal(typeof result.channel, 'string', 'Channel URL was propagated');
        assert.equal(result.statusCode, 200, 'WNS response is HTTP 200');
        assert.equal(typeof result.headers, 'object', 'HTTP response headers are present in the result');
        assert.equal(result.headers['x-wns-notificationstatus'], 'received', 'Notification was received by WNS');
        assert.equal(Object.getOwnPropertyNames(result.headers).some(function (item) {
            return item.toLowerCase().indexOf('x-wns-') !== 0;
        }), false, 'Only x-wns-* response headers were propagated');

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
        describe('notify.send' + item, function () {
            it('succeeds', function (done) {

                var nockFile = path.resolve(nockRecordingsDir, templateName + '-success.js');

                // construct parameter list

                var params = [ channel ];

                var numberOfTextFields = templateSpecs[templateName][0] * 2 + templateSpecs[templateName][1];
                for (var i = 0; i < numberOfTextFields; i++)
                    params.push('http://textParam' + (i + 1) + '.com');

                var mockScopes;
                var options1 = {
                    success: function (result) {
                        callback(null, result, done, nockFile, mockScopes);
                    },
                    error: function (error) {
                        callback(error, null, done, nockFile, mockScopes);
                    }                   
                };
                params.push(options1);

                var initiateNotification = function () {
                    if (!recordLiveSession) 
                        // load mock HTTP traffic captured previously
                        mockScopes = require(nockFile).setupMockScopes(nock);

                    var wns = notify.createWnsContext(options.client_secret, options.client_id);
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

describe('notify.sendBadge', function () {
    it('succeeds', function (done) {
        var nockFile = path.resolve(nockRecordingsDir, 'Badge-success.js');
        var mockScopes;
        if (!recordLiveSession) 
            // load mock HTTP traffic captured previously
            mockScopes = require(nockFile).setupMockScopes(nock);       

        var wns = notify.createWnsContext(options.client_secret, options.client_id);
        wns.sendBadge(channel, 'alert', {
            success: function (result) {
                callback(null, result, done, nockFile, mockScopes);
            },
            error: function (error) {
                callback(error, null, done, nockFile, mockScopes);
            }
        });
    });
});

describe('notify.sendRaw', function () {
    it('succeeds', function (done) {
        var nockFile = path.resolve(nockRecordingsDir, 'Raw-success.js');
        var mockScopes;
        if (!recordLiveSession) 
            // load mock HTTP traffic captured previously
            mockScopes = require(nockFile).setupMockScopes(nock, mockScopes);

        var wns = notify.createWnsContext(options.client_secret, options.client_id);
        wns.sendRaw(channel, "abc", {
            success: function (result) {
                callback(null, result, done, nockFile, mockScopes);
            },
            error: function (error) {
                callback(error, null, done, nockFile, mockScopes);
            }
        });
    });
});

describe('notify.send', function () {
    it('succeeds', function (done) {
        var nockFile = path.resolve(nockRecordingsDir, 'Send-success.js');
        var mockScopes;
        if (!recordLiveSession) 
            // load mock HTTP traffic captured previously
            mockScopes = require(nockFile).setupMockScopes(nock, mockScopes);       

        var wns = notify.createWnsContext(options.client_secret, options.client_id);
        wns.send(channel, "<tile><visual><binding template=\"TileSquareBlock\"><text id=\"1\">http://textParam1.com</text><text id=\"2\">http://textParam2.com</text></binding></visual></tile>", 
            'wns/tile', {
            success: function (result) {
                callback(null, result, done, nockFile, mockScopes);
            },
            error: function (error) {
                callback(error, null, done, nockFile, mockScopes);
            }
        });
    });
});

describe('notify.sendToastText01 with audio and toast options', function () {
    it('succeeds', function (done) {
        var nockFile = path.resolve(nockRecordingsDir, 'SendToastText01WithAudioAndToastOptions-success.js');
        var mockScopes;
        if (!recordLiveSession) 
            // load mock HTTP traffic captured previously
            mockScopes = require(nockFile).setupMockScopes(nock, mockScopes);       

        var options1 = {
            audio: {
                src: 'Alarm',
                silent: false,
                loop: true
            },
            launch: 'some random parameter passed to the application',
            duration: 'long',
            success: function (result) {
                callback(null, result, done, nockFile, mockScopes);
            },
            error: function (error) {
                callback(error, null, done, nockFile, mockScopes);
            }
        }

        var wns = notify.createWnsContext(options.client_secret, options.client_id);
        wns.sendToastText01(channel, 'A toast!', options1);
    });
});
