const helper = require('./helper');
const azure = require('fast-azure-storage');
const taskcluster = require('taskcluster-client');

suite('Test Cleanup', function() {
  suiteSetup(async function() {
    await helper.secrets.setup();
    if (!helper.secrets.have('azure')) {
      throw new Error('cleanup must run in an environment with access to the real azure credentials');
    }
  });

  test('cleanup testing containers (for all services)', async function() {
    this.timeout(0);
    const {accountId, accessKey} = helper.secrets.get('azure');
    const blob = new azure.Blob({accountId, accessKey});

    // specify a few prefixes of known test containers, including those from
    // https://github.com/taskcluster/azure-blob-storage which shares an Azure
    // account with this project
    const containerPattern =
      /^(azure-blob-storage-test-|auth-test-)/;
    const yesterday = taskcluster.fromNow('-1 day');
    let marker;
    while (1) {
      const result = await blob.listContainers({marker});
      for (let {name, properties: {lastModified}} of result.containers) {
        const match = containerPattern.exec(name);
        if (!match) {
          continue;
        }

        // see if this is too new - only delete containers from before yesterday
        if (new Date(lastModified) >= yesterday) {
          continue;
        }

        console.log(`deleting ${name}`);
        try {
          await blob.deleteContainer(name);
        } catch (err) {
          // this is likely because there are parallel runs of this task, so ignore
          // but log 404's
          if (err.code !== 'ResourceNotFound') {
            throw err;
          }
          console.log(`..failed: ${err}`);
        }
      }
      if (result.nextMarker) {
        marker = result.nextMarker;
      } else {
        break;
      }
    }
  });

  test('cleanup testing tables (for all services)', async function() {
    this.timeout(0);

    const {accountId, accessKey} = helper.secrets.get('azure');
    const table = new azure.Table({accountId, accessKey});

    // match the pattern used in libraries/testing/src/with-entity.js to name
    // test tables.  This is unlikely to match "real" tables, which anyhow should
    // be in a different storage account.
    const tablePattern = /T([0-9]{8})T[a-zA-Z0-9]{8}$/;
    const yesterday = new Date(new Date() - 1000 * 3600 * 24).toJSON().split('T')[0].replace(/-/g, '');
    let nextTableName;
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
