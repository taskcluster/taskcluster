const helper = require('./helper');
const azure = require('fast-azure-storage');

suite('Test Cleanup', function() {
  suiteSetup(async function() {
    await helper.secrets.setup();
    if (!helper.secrets.have('azure')) {
      throw new Error('cleanup must run in an environment with access to the real azure credentials');
    }
  });

  test('cleanup testing tables (for all services)', async function() {
    const {accountId, accountKey: accessKey} = helper.secrets.get('azure');
    const table = new azure.Table({accountId, accessKey});

    // match the pattern used in libraries/testing/src/with-entity.js to name
    // test tables.  This is unlikely to match "real" tables, which anyhow should
    // be in a different storage account.
    const tablePattern = /T([0-9]{8})T[a-zA-Z0-9]{8}$/;
    const yesterday = new Date(new Date() - 1000*3600*24).toJSON().split('T')[0].replace(/-/g, '');
    let nextTableName;
    try {
      await table.deleteTable('fooo');
    } catch (err) {
      console.log(Object.assign({}, err));
    }
    while (1) {
      const result = await table.queryTables({nextTableName});
      for (let name of result.tables) {
        const match = tablePattern.exec(name);
        if (!match) {
          continue;
        }

        // see if this is too new - only delete tables from before yesterday
        if (match[1] >= yesterday) {
          continue;
        }

        console.log(`deleting ${name}`);
        try {
          await table.deleteTable(name);
        } catch (err) {
          // this is likely because there are parallel runs of this task, so ignore
          // but log 404's
          if (err.code !== 'ResourceNotFound') {
            throw err;
          }
          console.log(`..failed: ${err}`);
        }
      }
      if (result.nextTableName) {
        nextTableName = result.nextTableName;
      } else {
        break;
      }
    }
  });
});
