import { strict as assert } from 'node:assert';
import taskcluster from '@taskcluster/client';
import testing from '@taskcluster/lib-testing';
import helper from './helper.js';
import { Worker } from '../src/data.js';
import { ResourceChecker } from '../src/resource-checker.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.resetTables();

  let monitor;
  suiteSetup(async () => {
    monitor = await helper.load('monitor');
  });

  const workerPoolId = 'pp/wt';
  const old = new Date(Date.now() - 5 * 3600 * 1000);

  /** @param {() => Promise<any[]>} listManagedResources */
  const fakeProvider = listManagedResources => ({
    providerId: 'cloud',
    providerType: 'google',
    setupFailed: false,
    listingScope: () => null,
    rootUrlTagValue: () => 'ours',
    listManagedResources,
  });

  const runCheck = async provider => {
    const providers = {
      forAll: cb => Promise.all([provider].filter(p => !p.setupFailed).map(cb)),
      setupFailed: () => [provider].filter(p => p.setupFailed),
    };
    await new ResourceChecker({ providers, db: helper.db, monitor }).check();
    const fields = type => monitor.manager.messages.filter(m => m.Type === type).map(m => m.Fields);
    return { dangling: fields('dangling-resource'), summaries: fields('dangling-resources-summary') };
  };

  const makeWorker = async (workerId, state, lastModified = old) => {
    const worker = Worker.fromApi({
      workerPoolId,
      workerGroup: 'zone-a',
      workerId,
      providerId: 'cloud',
      capacity: 1,
      state,
      providerData: {},
      expires: taskcluster.fromNow('1 day'),
    });
    worker.lastModified = lastModified;
    return worker.create(helper.db);
  };

  const instance = (workerId, extra = {}) => ({
    resourceType: 'instance',
    resourceId: workerId,
    name: workerId,
    location: 'zone-a',
    createdAt: old,
    rootUrlTag: 'ours',
    workerPoolId,
    worker: { workerPoolId, workerGroup: 'zone-a', workerId },
    ...extra,
  });
  const disk = (name, attached, extra = {}) => ({
    resourceType: 'disk',
    resourceId: name,
    name,
    location: 'zone-a',
    createdAt: old,
    rootUrlTag: 'ours',
    workerPoolId,
    attached,
    ...extra,
  });

  test('classifies listed resources', async () => {
    await makeWorker('running', Worker.states.RUNNING);
    await makeWorker('stopped', Worker.states.STOPPED);
    await makeWorker('stopping', Worker.states.STOPPED, new Date());

    const { dangling, summaries } = await runCheck(
      fakeProvider(async () => [
        instance('running'),
        instance('stopped'),
        instance('stopping'),
        instance('unknown'),
        instance('legacy', { rootUrlTag: null }),
        instance('foreign', { rootUrlTag: 'theirs' }),
        instance('young', { createdAt: new Date() }),
        disk('ageless', false, { createdAt: null }),
        disk('attached', true),
        disk('loose', false),
      ])
    );

    assert.deepEqual(
      dangling.map(d => [d.resourceId, d.reason, d.legacy, d.workerState]),
      [
        ['stopped', 'stopped-but-alive', false, 'stopped'],
        ['unknown', 'untracked', false, null],
        ['legacy', 'untracked', true, null],
        ['loose', 'unattached', false, null],
      ]
    );
    assert.deepEqual(summaries, [
      {
        providerId: 'cloud',
        providerType: 'google',
        listed: 10,
        byType: { instance: 7, disk: 3 },
        foreign: 1,
        legacy: 1,
        tooYoung: 1,
        unknownAge: 1,
        dangling: { untracked: 2, 'stopped-but-alive': 1, unattached: 1 },
        listErrors: 0,
        lookupErrors: 0,
        v: 1,
      },
    ]);
  });

  test('listing failure reports nothing dangling', async () => {
    const { dangling, summaries } = await runCheck(
      fakeProvider(async () => {
        throw new Error('cloud is down');
      })
    );

    assert.deepEqual(dangling, []);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].listErrors, 1);
    assert.equal(summaries[0].listed, 0);
    // the reported error is expected here
    monitor.manager.reset();
  });

  test('providers sharing a cloud account are listed once', async () => {
    const listed = [];
    const make = providerId => ({
      ...fakeProvider(async () => {
        listed.push(providerId);
        return [];
      }),
      providerId,
      listingScope: () => 'google/proj',
    });
    const [a, b] = [make('a'), make('b')];
    const providers = { forAll: cb => Promise.all([a, b].map(cb)), setupFailed: () => [] };
    await new ResourceChecker({ providers, db: helper.db, monitor }).check();
    assert.deepEqual(listed, ['a']);
  });

  test('provider whose setup failed is reported as a list error', async () => {
    const { dangling, summaries } = await runCheck({ ...fakeProvider(async () => []), setupFailed: true });
    assert.deepEqual(dangling, []);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].providerId, 'cloud');
    assert.equal(summaries[0].listErrors, 1);
  });
});
