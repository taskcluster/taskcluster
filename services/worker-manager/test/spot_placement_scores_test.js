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
  let hang;
  let sps;

  const respond = req => {
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
  };

  setup(() => {
    requests = [];
    scores = {};
    failing = false;
    hang = null;
    sps = new SpotPlacementScores({
      subscriptionId: 'sub id',
      monitor: { info() {}, warning() {}, reportError() {} },
      request: async req => {
        requests.push(req);
        if (hang) {
          await hang;
        }
        if (failing) {
          throw new Error('HTTP 403');
        }
        return respond(req);
      },
    });
  });

  const weights = (configs, toSpawn = 4) =>
    sps.adjustWeights({ workerPoolId: 'wp', toSpawn, configs }).map(c => c.weight);
  // weights after the background refresh that the first call starts
  const settled = async (configs, toSpawn = 4) => {
    weights(configs, toSpawn);
    await sps.refreshing;
    return weights(configs, toSpawn);
  };
  const expireAll = () => {
    for (const entry of sps.cache.values()) {
      entry.expires = 0;
    }
  };

  test('scales Spot weights by score and leaves other configs alone', async () => {
    scores = { [`eastus/${sku}`]: 'Medium', [`westus/${sku}`]: 'RestrictedSkuNotAvailable' };
    const configs = [spot('e', 'eastus'), spot('w', 'westus'), config('r', { location: 'eastus' })];

    assert.deepEqual(await settled(configs), [0.5, 0, 1]);
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

  test('does not wait for Azure', async () => {
    let release;
    hang = new Promise(resolve => {
      release = resolve;
    });
    try {
      const result = sps.adjustWeights({ workerPoolId: 'wp', toSpawn: 4, configs: [spot('e', 'eastus')] });
      assert(Array.isArray(result), 'returns weights right away, not a promise');
      assert.deepEqual(
        result.map(c => c.weight),
        [1]
      );
    } finally {
      release();
      await sps.refreshing;
    }
  });

  test('serves the old score while refreshing, and requests each key once', async () => {
    scores = { [`eastus/${sku}`]: 'RestrictedSkuNotAvailable' };
    assert.deepEqual(await settled([spot('e', 'eastus')]), [0]);

    expireAll();
    let release;
    hang = new Promise(resolve => {
      release = resolve;
    });
    scores = {};
    assert.deepEqual(weights([spot('e', 'eastus')]), [0], 'old score while the refresh runs');
    assert.deepEqual(weights([spot('e', 'eastus')]), [0]);
    assert.equal(sps.cache.get(`eastus/${sku}/4`.toLowerCase()).expires, Infinity, 'reserved until the fetch ends');
    release();
    await sps.refreshing;
    assert.equal(requests.length, 2, 'the reserved key is not requested again');
    assert(sps.cache.get(`eastus/${sku}/4`.toLowerCase()).expires < Infinity, 'the TTL starts when the fetch ends');
    assert.deepEqual(weights([spot('e', 'eastus')]), [1], 'new score after the refresh');
  });

  test('clears the old score when its refresh fails', async () => {
    scores = { [`eastus/${sku}`]: 'RestrictedSkuNotAvailable' };
    await settled([spot('e', 'eastus')]);
    expireAll();
    failing = true;
    assert.deepEqual(await settled([spot('e', 'eastus')]), [1]);
  });

  test('releases reserved keys if a refresh throws unexpectedly', async () => {
    sps.request = () => {
      throw new Error('boom');
    };
    // #fetch catches request errors, so make storing the results throw instead
    const set = sps.cache.set.bind(sps.cache);
    sps.cache.set = (key, value) => {
      if (value.expires !== Infinity) {
        throw new Error('unexpected');
      }
      return set(key, value);
    };
    weights([spot('e', 'eastus')]);
    await sps.refreshing;
    assert(sps.cache.get(`eastus/${sku}/4`.toLowerCase()).expires < Infinity);
  });

  test('reads location, size and priority from ARM template parameters', async () => {
    scores = { [`westus/${sku}`]: 'Low' };
    const arm = config('a', {
      armDeployment: {
        parameters: { location: { value: 'westus' }, vmSize: { value: sku }, priority: { value: 'Spot' } },
      },
    });
    assert.deepEqual(await settled([arm]), [0.1]);
  });

  test('asks for VMs, not capacity, rounded up to a power of two', async () => {
    await settled([spot('e', 'eastus', { workerManager: { capacityPerInstance: 3 } })], 4);
    await settled([spot('e', 'eastus')], 5);
    assert.deepEqual(
      requests.map(r => r.body.desiredCount),
      [2, 8]
    );
  });

  test('asks for no more VMs than the config has remaining capacity for', async () => {
    await settled([{ ...spot('e', 'eastus'), remainingCapacity: 2 }], 16);
    assert.equal(requests[0].body.desiredCount, 2);
  });

  test('asks each batch of regions only for the VM sizes those regions use', async () => {
    // the API takes at most 8 regions per request; the 9th region uses another size
    const regions = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'].map(r => spot(r, r));
    const other = config('r9', { priority: 'Spot', location: 'r9', hardwareProfile: { vmSize: 'Standard_Other' } });
    await settled([...regions, other]);
    assert.deepEqual(
      requests.map(r => r.body.desiredSizes.map(s => s.sku)),
      [[sku], ['Standard_Other']]
    );
  });

  test('gives no weight to a location without quota, whatever its score', async () => {
    scores = { [`eastus/${sku}`]: { score: 'High', isQuotaAvailable: false } };
    assert.deepEqual(await settled([spot('e', 'eastus')]), [0]);
  });

  test('caches scores per desired count', async () => {
    await settled([spot('e', 'eastus')], 4);
    await settled([spot('e', 'eastus')], 3);
    assert.equal(requests.length, 1, 'same rounded count uses the cache');
    await settled([spot('e', 'eastus')], 16);
    assert.equal(requests.length, 2, 'a different count asks again');
  });

  test('keeps weights when the request fails, and caches the failure', async () => {
    failing = true;
    assert.deepEqual(await settled([spot('e', 'eastus')]), [1]);
    await settled([spot('e', 'eastus')]);
    assert.equal(requests.length, 1);
  });

  test('a failed request keeps unexpired scores of other pairs in its batch', async () => {
    scores = { [`eastus/${sku}`]: 'RestrictedSkuNotAvailable' };
    await settled([spot('e', 'eastus')]);

    // eastus/other and westus/sku miss, so the request also covers the cached eastus/sku
    failing = true;
    const other = config('o', { priority: 'Spot', location: 'eastus', hardwareProfile: { vmSize: 'Standard_Other' } });
    assert.deepEqual(await settled([spot('e', 'eastus'), other, spot('w', 'westus')]), [0, 1, 1]);
    assert.deepEqual(requests[1].body.desiredLocations.sort(), ['eastus', 'westus']);
  });
});
