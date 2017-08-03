suite('provisioners', () => {
  var debug       = require('debug')('test:claim-work');
  var assert      = require('assert');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
  var helper      = require('./helper');
  var testing     = require('taskcluster-lib-testing');

  setup(async function() {
    let Provisioner = await helper.load('Provisioner', helper.loadOptions);
    await Provisioner.scan({}, {handler: p => p.remove()});
  });

  test('queue.listProvisioners returns an empty list', async () => {
    let result = await helper.queue.listProvisioners();
    assert(result.provisioners.length === 0, 'Did not expect any provisioners');
  });

  test('queue.listProvisioners returns provisioners', async () => {
    let Provisioner = await helper.load('Provisioner', helper.loadOptions);
    await Provisioner.create({provisionerId: 'prov1', expires: new Date('3017-07-29')});
    let result = await helper.queue.listProvisioners();
    assert(result.provisioners.length === 1, 'expected provisioners');
    assert(result.provisioners[0].provisionerId === 'prov1', 'expected prov1');
  });

  test('provisionerSeen creates and updates a provisioner', async () => {
    let workerInfo = await helper.load('workerInfo', helper.loadOptions);
    await Promise.all([
      workerInfo.provisionerSeen('prov2'),
      workerInfo.provisionerSeen('prov2'),
    ]);
    await workerInfo.provisionerSeen('prov2');
    let result = await helper.queue.listProvisioners();
    assert(result.provisioners.length === 1, 'expected a provisioner');
  });

  test('expiration works', async () => {
    let Provisioner = await helper.load('Provisioner', helper.loadOptions);
    await Provisioner.create({provisionerId: 'prov1', expires: new Date('1017-07-29')});

    await helper.expireWorkerInfo();

    let result = await helper.queue.listProvisioners();
    assert(result.provisioners.length === 0, 'expected no provisioners');
  });
});
