const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'notify' });

  helper.dbTest('update_widgets', async function(db, isFake) {
    // this function now does nothing
    const widgets = await db.fns.update_widgets("checkbox");
    const names = widgets.map(({name}) => name).sort();
    assert.deepEqual(names, []);
  });
});
