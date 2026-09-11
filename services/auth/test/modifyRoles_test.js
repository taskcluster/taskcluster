import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import { modifyRoles } from '../src/data.js';

suite(testing.suiteName(), () => {
  const conflict = () => Object.assign(new Error('unsuccessful update'), { code: 'P0004' });

  const fakeDb = modify_roles => ({
    fns: {
      get_roles: async () => [],
      modify_roles,
    },
  });

  test('retries after a conflict', async () => {
    let writes = 0;
    let modifierCalls = 0;
    const db = fakeDb(async () => {
      if (writes++ === 0) {
        throw conflict();
      }
    });

    await modifyRoles(db, () => {
      modifierCalls++;
    });

    assert.equal(modifierCalls, 2, 'modifier should rerun after a conflict');
    assert.equal(writes, 2);
  });

  test('rejects when the conflict never resolves', async () => {
    let modifierCalls = 0;
    const db = fakeDb(async () => {
      throw conflict();
    });

    await assert.rejects(
      () =>
        modifyRoles(db, () => {
          modifierCalls++;
        }),
      /too many conflicts/
    );

    assert.equal(modifierCalls, 5, 'modifier should have been run once per try');
  });

  test('does not retry or swallow other errors', async () => {
    let writes = 0;
    const db = fakeDb(async () => {
      writes++;
      throw new Error('Got a croissant when I expected a baguette');
    });

    await assert.rejects(() => modifyRoles(db, () => {}), /Got a croissant when I expected a baguette/);

    assert.equal(writes, 1);
  });
});
