suite("Entity (SAS from auth.taskcluster.net)", function() {
  var assert          = require('assert');
  var slugid          = require('slugid');
  var _               = require('lodash');
  var Promise         = require('promise');
  var base            = require('../../');
  var debug           = require('debug')('base:test:entity:auth');
  var express         = require('express');
  var azureTable      = require('azure-table-node');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  // Create test api
  var api = new base.API({
    title:        "Test TC-Auth",
    description:  "Another test api"
  });

  // Declare a method we can test parameterized scopes with
  var returnExpiredSAS = false;
  var callCount = 0;
  api.declare({
    method:     'get',
    route:      '/azure/:account/table/:table/read-write',
    name:       'azureTableSAS',
    deferAuth:  true,
    scopes:     [['auth:azure-table-access:<account>/<table>']],
    title:        "Test SAS End-Point",
    description:  "Get SAS for testing",
  }, function(req, res) {
    callCount += 1;
    var account = req.params.account;
    var table   = req.params.table;
    if (!req.satisfies({account: account, table: table})) {
      return;
    }
    var credentials = cfg.get('azure');
    assert(account === credentials.accountName, "Must used test account!");
    credentials = _.defaults({}, credentials, {
      accountUrl: [
        "https://",
        credentials.accountName,
        ".table.core.windows.net/"
      ].join('')
    });
    var client = azureTable.createClient(credentials);
    var expiry = new Date(Date.now() + 25 * 60 * 1000);
    // Return and old expiry, this causes a refresh on the next call
    if (returnExpiredSAS) {
      expiry = new Date(Date.now() + 15 * 60 * 1000 + 100);
    }
    var sas = client.generateSAS(
      table,
      'raud',
      expiry,
      {
        start:  new Date(Date.now() - 15 * 60 * 1000)
      }
    );
    res.status(200).json({
      expiry:   expiry.toJSON(),
      sas:      sas
    });
  });

  // Create servers
  var authServer = null;
  var server = null
  setup(function() {
    return base.testing.createMockAuthServer({
      port: 23247,
      clients: [
        {
          clientId:     'authed-client',
          accessToken:  'test-token',
          scopes:       ['*'],
          expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
        }, {
          clientId:     'unauthed-client',
          accessToken:  'test-token',
          scopes:       [],
          expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
        }
      ]
    }).then(function(authServer_) {
      authServer = authServer_;

      return base.validator();
    }).then(function(validator) {

      // Create a simple app
      var app = base.app({
        port:       23244,
        env:        'development',
        forceSSL:   false,
        trustProxy: false
      });

      app.use(api.router({
        validator:      validator,
        credentials: {
          clientId:     'authed-client',
          accessToken:  'test-token'
        },
        authBaseUrl:    'http://localhost:23247/v1'
      }));

      return app.createServer();
    }).then(function(server_) {
      server = server_;
    });
  });

  // Shutdown authServer
  teardown(function() {
    return server.terminate().then(function() {
      return authServer.terminate();
    });
  });


  var ItemV1;
  test("ItemV1 = Entity.configure", function() {
    ItemV1 = base.Entity.configure({
      version:          1,
      partitionKey:     base.Entity.keys.StringKey('id'),
      rowKey:           base.Entity.keys.StringKey('name'),
      properties: {
        id:             base.Entity.types.String,
        name:           base.Entity.types.String,
        count:          base.Entity.types.Number
      }
    });
  });

  var Item;
  test("Item = ItemV1.setup", function() {
    Item = ItemV1.setup({
      account:      cfg.get('azure:accountName'),
      table:        cfg.get('azureTestTableName'),
      credentials:  {
        clientId:         'authed-client',
        accessToken:      'test-token'
      },
      authBaseUrl:  'http://localhost:23244',
      minSASAuthExpiry: 15 * 60 * 1000
    });
  });

  test("Item.create && Item.load", function() {
    var id = slugid.v4();
    callCount = 0;
    returnExpiredSAS = false; // We should be able to reuse the SAS
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function() {
      return Item.load({
        id:     id,
        name:   'my-test-item',
      }).then(function(item) {
        assert(item.count === 1);
      });
    }).then(function() {
      assert(callCount === 1, "We should only have called once!");
    });
  });

  test("Expiry < now => refreshed SAS", function() {
    callCount = 0;
    returnExpiredSAS = true;  // This means we call for each operation
    var id = slugid.v4();
    var Item2 = ItemV1.setup({
      account:      cfg.get('azure:accountName'),
      table:        cfg.get('azureTestTableName'),
      credentials:  {
        clientId:         'authed-client',
        accessToken:      'test-token'
      },
      authBaseUrl:  'http://localhost:23244'
    });
    return Item2.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function() {
      assert(callCount === 1, "We should only have called once!");
      return base.testing.sleep(200);
    }).then(function() {
      return Item2.load({
        id:     id,
        name:   'my-test-item',
      }).then(function(item) {
        assert(item.count === 1);
      });
    }).then(function() {
      assert(callCount === 2, "We should have called twice!");
    });
  });

  test("Load in parallel, only gets SAS once", function() {
    callCount = 0;
    returnExpiredSAS = false;  // This means we call for each operation
    var Item3 = ItemV1.setup({
      account:      cfg.get('azure:accountName'),
      table:        cfg.get('azureTestTableName'),
      credentials:  {
        clientId:         'authed-client',
        accessToken:      'test-token'
      },
      authBaseUrl:  'http://localhost:23244'
    });
    return Promise.all([
      Item3.create({
        id:     slugid.v4(),
        name:   'my-test-item1',
        count:  1
      }),
      Item3.create({
        id:     slugid.v4(),
        name:   'my-test-item2',
        count:  1
      })
    ]).then(function() {
      assert(callCount === 1, "We should only have called once!");
    });
  });
});
