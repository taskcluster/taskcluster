import assert from 'assert';
import parseRoute from '../lib/util/route_parser';

suite('route parsing', () => {
  test('valid v1 format', async () => {
    assert.deepEqual(
      parseRoute('treeherder.try.XYZ'),
      {
        destination:   'treeherder',
        origin:        'hg.mozilla.org',
        project:       'try',
        revision_hash: 'XYZ',
        pushId:        undefined,
      }
    );
  });

  test('valid v2 format', async () => {
    assert.deepEqual(
      parseRoute('treeherder.v2.try.XYZ.234'),
      {
        destination:  'treeherder',
        origin:       'hg.mozilla.org',
        project:      'try',
        revision:     'XYZ',
        pushId:       234,
      }
    );
  });

  test('valid format - github', async () => {
    assert.deepEqual(
      parseRoute('treeherder.v2.dummy/try.XYZ.234'),
      {
        destination:  'treeherder',
        origin:       'github.com',
        owner:        'dummy',
        project:      'try',
        revision:     'XYZ',
        pushId:       234,
      }
    );
  });

  test('invalid format', async () => {
    assert.throws(
      () => { parseRoute('treeherder.try'); },
      /Unrecognized treeherder routing key format/
    );
  });
});
