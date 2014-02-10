var wns = require('../lib/wns.js')
	, assert = require('assert')
	, templateSpecs = require('./templates.js').specs
	, recordLiveSession = false
	, createResults = recordLiveSession ? undefined : require('./createResults.js').results
	, createBindingResults = recordLiveSession ? undefined : require('./createBindingResults.js').results
	, fs = require('fs');
	

// normalize test APIs between TDD and BDD
if (!global.describe) {
	describe = suite;
	it = test;
}

testCreateMethods('', __dirname + '/createResults.js', createResults);
testCreateMethods('Binding', __dirname + '/createBindingResults.js', createBindingResults);

function testCreateMethods(methodSuffix, logFile, expected) {
	var count = 0;
	var total = Object.getOwnPropertyNames(templateSpecs).length;
	var options = {
		lang: 'en-us',
		audio: {
			src: 'Alarm',
			silent: false,
			loop: true			
		}
	};

	if (recordLiveSession) {
		fs.writeFileSync(logFile, '// this file is auto-generated from apis.js\n\nexports.results = {\n');
	}

	for (var item in templateSpecs) {
		(function (item) {
			var template = templateSpecs[item];
			describe('wns.create' + item + methodSuffix, function () {
				it('succeeds', function (done) {
					// test passing string parameters in
					var params = [];
					for (var i = 0; i < ((template[0] * 2) + template[1]); i++)
						params.push('item' + i);

					params.push(options);
					var result = wns['create' + item + methodSuffix].apply(this, params);
					if (recordLiveSession) {
						fs.appendFileSync(logFile, '    ' + item + 'Plain: \'' + result + '\',\n');
					}
					else {						
						assert.equal(result, expected[item + 'Plain']);
					}

					// test passing an object in
					var payload = { lang: 'en-gb' };
					var k = 0;
					for (var i = 0; i < template[0]; i++) {
						payload['image' + (i+1) + 'src'] = 'item' + k++;
						payload['image' + (i+1) + 'alt'] = 'item' + k++;
					}

					for (var i = 0; i < template[1]; i++) {
						payload['text' + (i+1)] = 'item' + k++;
					}

					result = wns['create' + item + methodSuffix].call(this, payload, options);
					if (recordLiveSession) {
						fs.appendFileSync(logFile, '    ' + item + 'Object: \'' + result + '\',\n');
						if (++count == total) {
							fs.appendFileSync(logFile, '};\n');					
						}
					}
					else {						
						assert.equal(result, expected[item + 'Object']);					
					}

					done();
				});
			});
		})(item);
	}
}

describe('wns.createToast', function () {
	it('fails without parameters', function () {
		assert.throws(
			wns.createToast,
			/At least one binding must be specified/
		);
	});

	it('fails with wrong parameter types', function () {
		assert.throws(
			function () { wns.createToast(12); },
			/Unsuported type of argument: number/
		);
	});

	it('fails with non-binding string parameter', function () {
		assert.throws(
			function () { wns.createToast('foo'); },
			/Every string argument must be a WNS binding XML/
		);
	});

	it('succeeds with plain parameters', function () {
		var result = wns.createToast(
			wns.createToastText01Binding('foo'),
			wns.createToastText01Binding('bar'),
			{ lang: 'en-gb', audio: { src: 'Alarm', loop: true } }
		);
		assert.equal(result, '<toast><visual lang="en-gb"><binding template="ToastText01"><text id="1">foo</text></binding>' +
			'<binding template="ToastText01"><text id="1">bar</text></binding></visual>' +
			'<audio src="ms-winsoundevent:Notification.Alarm" loop="true"/></toast>');
	});

	it('succeeds with object parameters', function () {
		var result = wns.createToast(
			{ type: 'ToastText01', text1: 'foo', lang: 'pl' },
			{ type: 'ToastText01', text1: 'bar', lang: 'en-us' },
			{ lang: 'en-gb', audio: { src: 'Alarm', loop: true } }
		);
		assert.equal(result, '<toast><visual lang="en-gb"><binding template="ToastText01" lang="pl"><text id="1">foo</text></binding>' +
			'<binding template="ToastText01" lang="en-us"><text id="1">bar</text></binding></visual>' +
			'<audio src="ms-winsoundevent:Notification.Alarm" loop="true"/></toast>');
	});
});

describe('wns.createTile', function () {
	it('fails without parameters', function () {
		assert.throws(
			wns.createTile,
			/At least one binding must be specified/
		);
	});

	it('fails with wrong parameter types', function () {
		assert.throws(
			function () { wns.createTile(12); },
			/Unsuported type of argument: number/
		);
	});

	it('fails with non-binding string parameter', function () {
		assert.throws(
			function () { wns.createTile('foo'); },
			/Every string argument must be a WNS binding XML/
		);
	});

	it('succeeds with plain parameters', function () {
		var result = wns.createTile(
			wns.createTileSquareText04Binding('foo'),
			wns.createTileSquareText04Binding('bar'),
			{ lang: 'en-gb' }
		);
		assert.equal(result, '<tile><visual lang="en-gb"><binding template="TileSquareText04"><text id="1">foo</text></binding>' +
			'<binding template="TileSquareText04"><text id="1">bar</text></binding></visual></tile>');
	});

	it('succeeds with object parameters', function () {
		var result = wns.createTile(
			{ type: 'TileSquareText04', text1: 'foo', lang: 'pl' },
			{ type: 'TileSquareText04', text1: 'bar', lang: 'en-us' },
			{ lang: 'en-gb' }
		);
		assert.equal(result, '<tile><visual lang="en-gb"><binding template="TileSquareText04" lang="pl"><text id="1">foo</text></binding>' +
			'<binding template="TileSquareText04" lang="en-us"><text id="1">bar</text></binding></visual></tile>');
	});
});

describe('wns.send', function () {
	it('fails without parameters', function () {
		assert.throws(
			wns.send,
			/The channel parameter must be the channel URI string/
		);
	});

	it ('fails with wrong channel type', function () {
		assert.throws(
			function () { wns.send({}) },
			/The channel parameter must be the channel URI string/
		);
	});

	it ('fails without payload', function () {
		assert.throws(
			function () { wns.send('http://foo') },
			/The payload parameter must be the notification payload string/
		);
	});	

	it ('fails with wrong payload type', function () {
		assert.throws(
			function () { wns.send('http://foo') },
			/The payload parameter must be the notification payload string/
		);
	});	

	it ('fails without type', function () {
		assert.throws(
			function () { wns.send('http://foo', 'payload') },
			/The type parameter must specify the notification type/
		);
	});	

	it ('fails with wrong payload type', function () {
		assert.throws(
			function () { wns.send('http://foo', 'payload') },
			/The type parameter must specify the notification type/
		);
	});		

	it ('fails without credentials', function () {
		assert.throws(
			function () { wns.send('http://foo', 'payload', 'wns/tile'); },
			/The options.client_id and options.client_secret must be specified as strings/
		);
	});		

	it ('fails with wrong callback type', function () {
		assert.throws(
			function () { wns.send('http://foo', 'payload', 'wns/tile', { client_id: 'foo', client_secret: 'bar' }, {}); },
			/The callback parameter, if specified, must be the callback function/
		);
	});				
});

describe('wns.sendBadge', function () {
	it('fails without parameters', function () {
		assert.throws(
			wns.sendBadge,
			/The badge value must be a string or a number/
		);
	});

	it ('fails with wrong channel type', function () {
		assert.throws(
			function () { wns.sendBadge({}) },
			/The badge value must be a string or a number/
		);
	});

	it ('fails without value', function () {
		assert.throws(
			function () { wns.sendBadge('http://foo') },
			/The badge value must be a string or a number/
		);
	});	

	it ('fails with too small integer value type', function () {
		assert.throws(
			function () { wns.sendBadge('http://foo', -1) },
			/The badge numeric value must be greater than or equal to 0/
		);
	});	

	it ('fails with invalid string value type', function () {
		assert.throws(
			function () { wns.sendBadge('http://foo', 'foobar') },
			/The badge value must be either an integer greater than or equal to 0 or one of/
		);
	});	

	it ('fails without credentials', function () {
		assert.throws(
			function () { wns.sendBadge('http://foo', 'alert'); },
			/The options.client_id and options.client_secret must be specified as strings/
		);
	});		

	it ('fails with wrong callback type', function () {
		assert.throws(
			function () { wns.sendBadge('http://foo', 'alert', { client_id: 'foo', client_secret: 'bar' }, {}); },
			/The callback parameter, if specified, must be the callback function/
		);
	});
});

describe('wns.sendTileWideImageAndText01', function () {
	it('fails without parameters', function () {
		assert.throws(
			wns.sendTileWideImageAndText01,
			/The channel parameter must be the channel URI string/
		);
	});

	it ('fails with wrong channel type', function () {
		assert.throws(
			function () { wns.sendTileWideImageAndText01({}) },
			/The channel parameter must be the channel URI string/
		);
	});

	it ('fails without values', function () {
		assert.throws(
			function () { wns.sendTileWideImageAndText01('http://foo') },
			/The TileWideImageAndText01 WNS notification type requires 3 text parameters to be specified/
		);
	});	

	it ('fails with too few values', function () {
		assert.throws(
			function () { wns.sendTileWideImageAndText01('http://foo', 'a', 'b') },
			/The TileWideImageAndText01 WNS notification type requires 3 text parameters to be specified/
		);
	});	

	it ('fails with wrong value types', function () {
		assert.throws(
			function () { wns.sendTileWideImageAndText01('http://foo', 'a', {}) },
			/The TileWideImageAndText01 WNS notification type requires 3 text parameters to be specified/
		);
	});			

	it ('fails without credentials', function () {
		assert.throws(
			function () { wns.sendTileWideImageAndText01('http://foo', {}); },
			/The options.client_id and options.client_secret must be specified as strings/
		);
	});		

	it ('fails with wrong callback type', function () {
		assert.throws(
			function () { wns.sendTileWideImageAndText01('http://foo', {}, { client_id: 'foo', client_secret: 'bar' }, {}); },
			/The callback parameter, if specified, must be the callback function/
		);
	});
});
