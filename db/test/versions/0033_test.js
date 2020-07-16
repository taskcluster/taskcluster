const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  suiteSetup(async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(THIS_VERSION);
  });

  const b64 = x => Buffer.from(x).toString('base64');

  const samples = [
    {__bufchunks_val: 0},
    {__bufchunks_val: 1, __buf0_val: ''},
    {__bufchunks_val: 1, __buf0_val: b64('Hello')},
    {__bufchunks_val: 1, __buf0_val: b64('uh\\oh')},
    {__bufchunks_val: 2, __buf0_val: b64('Good'), __buf1_val: b64('Morning')}
  ];

  const mkContainer = async (properties) => {
    return await helper.withDbClient(async client => {
      const t = await client.query(`
          select entity_to_crypto_container_v0($1, 'val') as container 
        `, [properties]);

      return t.rows[0].container;
    });
  };
  const encodeContainer = async (properties) => {
    return await helper.withDbClient(async client => {
      const t = await client.query(`
          select encrypted_entity_buf_encode('{}'::jsonb, 'fooBar', $1) as encoded
        `, [properties]);

      return t.rows[0].encoded;
    });
  };
  const entityToCryptoContainerV0 = (name, properties, expected) => {
    test(`entity_to_crypto_container_v0: ${name}`, async function() {
      const c = await mkContainer(properties);
      assert.deepEqual(c, expected);
    });
  };

  const container = { kid: 'azure', v: 0 };
  entityToCryptoContainerV0('0 bufs', samples[0], {...container, ...samples[0]});
  entityToCryptoContainerV0('empty', samples[1], {...container, ...samples[1]});
  entityToCryptoContainerV0('simple string', samples[2], {...container, ...samples[2]});
  entityToCryptoContainerV0('backslashy string', samples[3], {...container, ...samples[3]});
  entityToCryptoContainerV0('multiple chunks', samples[4], {...container, ...samples[4]});

  const encryptedEntityBufEncode = (name, properties) => {
    test(`entity_buf_encode: ${name}`, async function() {
      const c = await mkContainer(properties);
      const e = await encodeContainer(c);
      assert.equal(e.__bufchunks_fooBar, c.__bufchunks_val);
      for (let i = 0; i < c.__bufchunks_val; i++) {
        assert.equal(e[`__buf${i}_fooBar`], c[`__buf${i}_val`]);
      }
    });
  };

  encryptedEntityBufEncode('0 bufs', samples[0]);
  encryptedEntityBufEncode('empty', samples[1]);
  encryptedEntityBufEncode('simple string', samples[2]);
  encryptedEntityBufEncode('backslashy string', samples[3]);
  encryptedEntityBufEncode('multiple chunks', samples[4]);
});
