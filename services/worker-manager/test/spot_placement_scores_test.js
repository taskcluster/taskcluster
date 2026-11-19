import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import { SpotPlacementScores } from '../src/providers/azure/spot-placement-scores.js';

suite(testing.suiteName(), () => {
  const sku = 'Standard_D2_v5';
  const config = (launchConfigId, configuration) => ({
    launchConfig: { launchConfigId, configuration },
    weight: 1,
    remainingCapacity: 10,
  });
  const spot = (launchConfigId, location, extra = {}) =>
    config(launchConfigId, { priority: 'Spot', location, hardwareProfile: { vmSize: sku }, ...extra });

  let requests;
  let scores;
  let failing;
  let sps;

  setup(() => {
    requests = [];
    scores = {};
    failing = false;
    sps = new SpotPlacementScores({
      subscriptionId: 'sub id',
      monitor: { info() {}, warning() {} },
      request: async req => {
        requests.push(req);
        if (failing) {
          throw new Error('HTTP 403');
        }
        const { desiredLocations, desiredSizes } = req.body;
        return {
          placementScores: desiredLocations.flatMap(region =>
            desiredSizes.map(({ sku }) => {
              // a value is a score, or an object with extra response fields such as isQuotaAvailable
              const v = scores[`${region}/${sku}`] ?? 'High';
              return typeof v === 'string' ? { region, sku, score: v } : { region, sku, ...v };
            })
          ),
        };
      },
    });
  });

  const weights = async (configs, toSpawn = 4) =>
    (await sps.adjustWeights({ workerPoolId: 'wp', toSpawn, configs })).map(c => c.weight);

  test('scales Spot weights by score and leaves other configs alone', async () => {
    scores = { [`eastus/${sku}`]: 'Medium', [`westus/${sku}`]: 'RestrictedSkuNotAvailable' };
    const configs = [spot('e', 'eastus'), spot('w', 'westus'), config('r', { location: 'eastus' })];

    assert.deepEqual(await weights(configs), [0.5, 0, 1]);
    assert.deepEqual(
      configs.map(c => c.weight),
      [1, 1, 1],
      'input configs are not modified'
    );
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].url,
      'https://management.azure.com/subscriptions/sub%20id/providers/Microsoft.Compute/locations/eastus/placementScores/spot/generate?api-version=2025-06-05'
    );
  });

  test('reads location, size and priority from ARM template parameters', async () => {
    scores = { [`westus/${sku}`]: 'Low' };
    const arm = config('a', {
      armDeployment: {
        parameters: { location: { value: 'westus' }, vmSize: { value: sku }, priority: { value: 'Spot' } },
      },
    });
    assert.deepEqual(await weights([arm]), [0.1]);
  });

  test('asks for VMs, not capacity, rounded up to a power of two', async () => {
    await weights([spot('e', 'eastus', { workerManager: { capacityPerInstance: 3 } })], 4);
    await weights([spot('e', 'eastus')], 5);
    assert.deepEqual(
      requests.map(r => r.body.desiredCount),
      [2, 8]
    );
  });

  test('gives no weight to a location without quota, whatever its score', async () => {
    scores = { [`eastus/${sku}`]: { score: 'High', isQuotaAvailable: false } };
    assert.deepEqual(await weights([spot('e', 'eastus')]), [0]);
  });

  test('caches scores per desired count', async () => {
    await weights([spot('e', 'eastus')], 4);
    await weights([spot('e', 'eastus')], 3);
    assert.equal(requests.length, 1, 'same rounded count uses the cache');
    await weights([spot('e', 'eastus')], 16);
    assert.equal(requests.length, 2, 'a different count asks again');
  });

  test('keeps weights when the request fails, and caches the failure', async () => {
    failing = true;
    assert.deepEqual(await weights([spot('e', 'eastus')]), [1]);
    await weights([spot('e', 'eastus')]);
    assert.equal(requests.length, 1);
  });

  test('a failed request keeps unexpired scores of other pairs in its batch', async () => {
    scores = { [`eastus/${sku}`]: 'RestrictedSkuNotAvailable' };
    await weights([spot('e', 'eastus')]);

    // eastus/other and westus/sku miss, so the request also covers the cached eastus/sku
    failing = true;
    const other = config('o', { priority: 'Spot', location: 'eastus', hardwareProfile: { vmSize: 'Standard_Other' } });
    assert.deepEqual(await weights([spot('e', 'eastus'), other, spot('w', 'westus')]), [0, 1, 1]);
    assert.deepEqual(requests[1].body.desiredLocations.sort(), ['eastus', 'westus']);
  });
});
