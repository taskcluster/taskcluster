const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const hugeBufs = require('./fixtures/huge_bufs.js');

const ASCII = _.range(1, 128).map(i => String.fromCharCode(i)).join(' ');
const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);

// (copied from azure-entities)
const encodeStringKey = function(str) {
  if (str === '') {
    return '!';
  }
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/~/g, '%7e')
    .replace(/%/g, '!');
};

const decodeStringKey = function(str) {
  if (str === '!') {
    return '';
  }

  // note that this does not need any special handling for %21 or %7e, as
  // decodeURIComponet will happily decode them, even though encodeURIComponent
  // would not encode them.
  return decodeURIComponent(str.replace(/!/g, '%'));
};

const encodeCompositeKey = function(key1, key2) {
  return `${encodeStringKey(key1)}~${encodeStringKey(key2)}`;
};

const decodeCompositeKey = function(key) {
  return key.split('~').map(decodeStringKey);
};

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  suiteSetup(async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(THIS_VERSION);
  });

  const b64 = x => Buffer.from(x).toString('base64');

  const entityBufDecodeTest = (name, encoded, expected, xfail) => {
    test(`entity_buf_decode: ${name}${xfail && ' (XFAIL)'}`, async function() {
      await helper.withDbClient(async client => {
        const t = await client.query(`
          select entity_buf_decode($1, 'val') as decoded
        `, [encoded]);
        if (!xfail) {
          assert.equal(t.rows[0].decoded, expected);
        } else {
          assert.notEqual(t.rows[0].decoded, expected);
        }
      });
    });
  };
  // (this is used by 0010_test.js, too)
  exports.entityBufDecodeTest = entityBufDecodeTest;

  entityBufDecodeTest('0 bufs', {__bufchunks_val: 0}, '');
  entityBufDecodeTest('empty', {__bufchunks_val: 1, __buf0_val: ''}, '');
  entityBufDecodeTest('simple string', {__bufchunks_val: 1, __buf0_val: b64('Hello')}, 'Hello');
  entityBufDecodeTest('backslashy string', {__bufchunks_val: 1, __buf0_val: b64('uh\\oh')}, 'uh\\oh');
  // see db version 10 where this expected failure is fixed..
  entityBufDecodeTest('2 huge bufs', hugeBufs.encoded, hugeBufs.decoded, true);

  const entityBufEncodeTest = (name, value) => {
    test(`entity_buf_encode: ${name}`, async function() {
      await helper.withDbClient(async client => {
        const t = await client.query(`
          select entity_buf_encode('{}'::jsonb, 'val', $1) as encoded
        `, [value]);
        assert.equal(t.rows[0].encoded.__bufchunks_val, 1);
        assert.equal(t.rows[0].encoded.__buf0_val, b64(value));
      });
    });
  };

  entityBufEncodeTest('simple string', 'Hello');
  entityBufEncodeTest('empty string', '');
  entityBufEncodeTest('backslashy string', 'oh\\no');
  entityBufEncodeTest('all ascii', ASCII);

  const entityBufRoundTrip = (name, value) => {
    test(`entity_buf_en/decode round-trip: ${name}`, async function() {
      await helper.withDbClient(async client => {
        const res = await client.query(`
          select entity_buf_decode(
            entity_buf_encode('{}'::jsonb, 'val', $1),
            'val') as output
        `, [value]);
        assert.deepEqual(res.rows[0].output, value);
      });
    });
  };

  entityBufRoundTrip('simple string', "hello");
  entityBufRoundTrip('json array', JSON.stringify([1, 2, "three"]));
  entityBufRoundTrip('string with backslashes', "back\\slash");
  entityBufRoundTrip('json with backslashes', JSON.stringify(["back\\slash"]));

  const encodeStringKeyTest = (name, input) => {
    test(`encode_string_key: ${name}`, async function() {
      await helper.withDbClient(async client => {
        const res = await client.query(
          'select encode_string_key($1) as output',
          [input]);
        assert.equal(res.rows[0].output, encodeStringKey(input));
      });
    });
  };

  encodeStringKeyTest('empty', '');
  encodeStringKeyTest('all chars', ASCII);
  encodeStringKeyTest('slashed worker pool id', 'worker/pool');

  const decodeStringKeyTest = (name, input) => {
    test(`decode_string_key: ${name}`, async function() {
      await helper.withDbClient(async client => {
        const res = await client.query(
          'select decode_string_key($1) as output',
          [input]);
        assert.equal(res.rows[0].output, decodeStringKey(input));
      });
    });
  };

  decodeStringKeyTest('empty', '!');
  decodeStringKeyTest('no encoded chars', 'foobar');
  decodeStringKeyTest('slash', 'foo!2fbar');
  decodeStringKeyTest('unencoded backslash', 'foo\\bar');
  decodeStringKeyTest('encoded backslash', 'fooi!5cfbar');
  decodeStringKeyTest('bang', 'foo!21bar');
  decodeStringKeyTest('percent', 'foo!25bar');
  decodeStringKeyTest('tilde', 'foo!7ebar');
  decodeStringKeyTest('initial tilde', '!7ebar');
  decodeStringKeyTest('encoded only', '!7e');
  decodeStringKeyTest('consecutive escapes', '!7e!5e!25abc');
  decodeStringKeyTest('multiple escapes', '!7ea!5eb!25c');

  const encodeDecodeRoundTrip = (name, value) => {
    test(`en/decode_string_key: ${name}`, async function() {
      await helper.withDbClient(async client => {
        const res = await client.query(
          'select decode_string_key(encode_string_key($1)) as output',
          [value]);
        assert.equal(res.rows[0].output, value);
      });
    });
  };

  encodeDecodeRoundTrip('empty', '');
  encodeDecodeRoundTrip('all chars', ASCII);
  encodeDecodeRoundTrip('backslash', '\\');
  encodeDecodeRoundTrip('tilde', '~');

  const encodeCompositeKeyTest = (name, input) => {
    test(`decode_composite_key: ${name}`, async function() {
      await helper.withDbClient(async client => {
        const res = await client.query(
          'select encode_composite_key($1, $2) as output',
          [input[0], input[1]]);
        assert.equal(res.rows[0].output, encodeCompositeKey(...input));
      });
    });
  };

  encodeCompositeKeyTest('foo bar', ['foo', 'bar']);
  encodeCompositeKeyTest('empty', ['', '']);
  encodeCompositeKeyTest('empty first key', ['abc', '']);
  encodeCompositeKeyTest('empty second key', ['', 'def']);
  encodeCompositeKeyTest('weird chars', [ASCII, 'def']);

  const decodeCompositeKeyTest = (name, input) => {
    test(`decode_composite_key: ${name}`, async function() {
      await helper.withDbClient(async client => {
        const res = await client.query(
          'select decode_composite_key($1) as output',
          [input]);
        assert.deepEqual(res.rows[0].output, decodeCompositeKey(input));
      });
    });
  };

  decodeCompositeKeyTest('foo bar', 'foo~bar');
  decodeCompositeKeyTest('empty', '!~!');
  decodeCompositeKeyTest('encoded', 'foo!2fbar~bar!5cfoo');

  const compositeKeyRoundTripTest = (name, value) => {
    test(`en/decode_composite_key: ${name}`, async function() {
      await helper.withDbClient(async client => {
        const res = await client.query(
          'select decode_composite_key(encode_composite_key($1, $2)) as output',
          [value[0], value[1]]);
        assert.deepEqual(res.rows[0].output, value);
      });
    });
  };

  compositeKeyRoundTripTest('empty', ['', '']);
  compositeKeyRoundTripTest('ascii', [ASCII, ASCII]);
  compositeKeyRoundTripTest('pre-encoded', ['foo!2fbar~bar!5cfoo', '']);
});
