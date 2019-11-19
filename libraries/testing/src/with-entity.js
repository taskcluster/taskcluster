const slugid = require('slugid');

// a suffix used to generate unique table names so that parallel test runs do not
// interfere with one another.  The table name includes the date so that old tables
// can be removed by an out-of-band process (as CI for services does not have
// permission to remove tables).  Note that this suffix corresponds to a regex
// in services/auth/test/cleanup.js!
const TABLE_SUFFIX = (() => {
  const date = new Date().toJSON().split('T')[0].replace(/-/g, '');
  const rand = slugid.nice().replace(/[_-]/g, '').slice(0, 8);
  return `T${date}T${rand}`;
})();

const bug1579496fixed = false;

// withEntity: monkey-patch an entity class to either use inmemory data
// or to use a unique table name, and set up to ensure the table exists and
// is empty at startup, and when the test completes.
module.exports = (mock, skipping, helper, loaderComponent, cls,
  {orderedTests, cleanup, noSasCredentials} = {}) => {
  let component;

  // Bug 1579496 has Azure behaving badly, so always use mock azure until
  // that's fixed.  This allows things other than Azure entities to still
  // test against the "real" thing.
  if (!mock && !bug1579496fixed) {
    mock = true;
  }

  // on suite setup, monkey-patch the `setup` method of each class to do what
  // we promise; then un-patch it on teardown
  suiteSetup(`withEntity for ${loaderComponent}`, async function() {
    if (skipping()) {
      return;
    }

    const cfg = await helper.load('cfg');
    const oldSetup = cls.setup;
    cls.setup = async function ({...options}) {
      if (mock) {
        options.credentials = 'inMemory';
      } else {
        options.tableName = options.tableName + TABLE_SUFFIX;
        // supply raw Azure credentials for the table
        if (!noSasCredentials) {
          options.credentials = cfg.azure;
        }
      }

      // un-monkeypatch
      cls.setup = oldSetup;
      const entity = await this.setup(options);
      await entity.ensureTable();
      return entity;
    };

    // now invoke the loader component to load this class
    component = await helper.load(loaderComponent);
    helper[loaderComponent] = component;

    // ensure the table exists (except when using SAS, where it is done for us)
    if (mock || noSasCredentials) {
      await component.ensureTable();
    }
  });

  // the default cleanup operation is just to delete all rows
  if (!cleanup) {
    cleanup = async () => {
      if (!skipping() && component) {
        await component.scan({}, {
          handler: async e => {
            try {
              await e.remove();
            } catch (err) {
              // ResourceNotFoundError is OK, at least it's deleted..
              if (err.name !== 'ResourceNotFoundError') {
                throw err;
              }
            }
          },
        });
      }
    };
  }

  // if tests are not ordered, empty the table before each test, and for
  // completeness after the suite; otherwise empty before the suite but
  // not between tests
  if (orderedTests) {
    suiteSetup(`withEntity for ${loaderComponent}`, cleanup);
  } else {
    setup(`withEntity for ${loaderComponent}`, cleanup);
  }

  suiteTeardown(`withEntity for ${loaderComponent}`, async function() {
    if (skipping()) {
      return;
    }
    await cleanup();

    component = helper[loaderComponent] = null;
  });
};

module.exports.secret = [
  {env: 'AZURE_ACCOUNT', cfg: 'azure.accountId', name: 'accountId'},
  {env: 'AZURE_ACCOUNT_KEY', cfg: 'azure.accessKey', name: 'accessKey'},
];
