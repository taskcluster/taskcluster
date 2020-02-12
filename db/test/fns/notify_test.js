const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'notify' });

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from widgets');
      await client.query(`insert into widgets (name) values ('button'), ('slider')`);
    });
    helper.fakeDb.notify.reset();
    helper.fakeDb.notify.addWidget("button");
    helper.fakeDb.notify.addWidget("slider");
  });

  helper.dbTest('update_widgets', async function(db, isFake) {
    const widgets = await db.fns.update_widgets("checkbox");
    const names = widgets.map(({name}) => name).sort();
    assert.deepEqual(names, ["button", "checkbox", "slider"]);
  });
});
