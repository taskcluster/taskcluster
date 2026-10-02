import helper from '../helper.js';
import { strict as assert } from 'node:assert';

export const entityBufDecodeTest = (name, encoded, expected, xfail) => {
  test(`entity_buf_decode: ${name}${xfail && ' (XFAIL)'}`, async () => {
    await helper.withDbClient(async client => {
      const t = await client.query(
        `
        select entity_buf_decode($1, 'val') as decoded
      `,
        [encoded]
      );
      if (!xfail) {
        assert.equal(t.rows[0].decoded, expected);
      } else {
        assert.notEqual(t.rows[0].decoded, expected);
      }
    });
  });
};
