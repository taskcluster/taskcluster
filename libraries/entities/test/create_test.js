const { Database, Schema } = require('taskcluster-lib-postgres');
const { Entity } = require('taskcluster-lib-entities');
const path = require('path');

suite(path.basename(__filename), function() {
  test('create entity', async function() {
    const schema = Schema.fromDbDirectory(path.join(__dirname, 'db'));
    const db = await Database.setup({ schema, readDbUrl: process.env.TEST_DB_URL, writeDbUrl: process.env.TEST_DB_URL, serviceName: 'test-entities' });

    await Database.upgrade({ schema, adminDbUrl: process.env.TEST_DB_URL, serviceName: 'test-entities' });

    const entity = Entity.configure({
      partitionKey: 'taskId',
      rowKey: 'task',
      properties: {
        taskId: 'string',
        provisionerId: 'string',
        workerType: 'string'
      },
    });

    entity.setup({ db, tableName: 'task-entities' });
  });
});
