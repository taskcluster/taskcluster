import assert from 'assert';
import parseRoute from '../lib/util/route_parser';

suite("route parsing", () => {
  test("valid format - no push id", async () => {
    assert.deepEqual(
      parseRoute('treeherder.try.XYZ'),
      {
        destination:  'treeherder',
        origin:       'hg.mozilla.org',
        project:      'try',
        revision:     'XYZ',
        pushId:       undefined
      }
    );
  });

  test("valid format - with push id", async () => {
    assert.deepEqual(
      parseRoute('treeherder.try.XYZ.234'),
      {
        destination:  'treeherder',
        origin:       'hg.mozilla.org',
        project:      'try',
        revision:     'XYZ',
        pushId:       234
      }
    );
  });

  test("valid format - github", async () => {
    assert.deepEqual(
      parseRoute('treeherder.dummy/try.XYZ.234'),
      {
        destination:  'treeherder',
        origin:       'github.com',
        owner:        'dummy',
        project:      'try',
        revision:     'XYZ',
        pushId:       234
      }
    );
  });

  test("invalid format", async () => {
    assert.throws(
      () => { parseRoute('treeherder.try') },
      /Route is not of an expected format/
    );
  });
});
