import _ from 'lodash';
import { armParameterValue } from './utils.js';

// https://learn.microsoft.com/en-us/rest/api/recommenderrp/spot-placement-scores/post?view=rest-recommenderrp-2025-06-05
// Microsoft suggests caching scores for 15 to 30 minutes
const TTL_MS = 15 * 60 * 1000;
// launch config weight multiplier per score; other scores (e.g. DataNotFoundOrStale) keep the weight
const SCORE_WEIGHTS = { High: 1, Medium: 0.5, Low: 0.1, RestrictedSkuNotAvailable: 0, InsufficientQuota: 0 };
const scoreKey = ({ location, sku, count }) => `${location}/${sku}/${count}`.toLowerCase();

/**
 * The location and VM size of a Spot launch config, or null if it is not Spot
 * shortcut: regional scores only, a launch config pinned to a zone gets its region's score
 */
function spotTarget(cfg) {
  const arm = cfg.armDeployment;
  const priority = arm ? armParameterValue(arm.parameters, 'priority') : cfg.priority;
  const location = arm ? armParameterValue(arm.parameters, 'location') : cfg.location;
  const sku = arm ? armParameterValue(arm.parameters, 'vmSize') : cfg.hardwareProfile?.vmSize;
  if (String(priority).toLowerCase() !== 'spot' || typeof location !== 'string' || typeof sku !== 'string') {
    return null;
  }
  return { location, sku };
}

/**
 * Azure Spot Placement Scores for launch configs, with a cache per (region, VM size, desired count).
 * Microsoft recommends caching per subscription as well; one instance serves one subscription.
 */
export class SpotPlacementScores {
  /** @type {Map<string, { expires: number, score?: string }>} */
  cache = new Map();

  /**
   * Settles when every refresh started so far has finished. Selection never awaits this; tests do.
   * @type {Promise<void>}
   */
  refreshing = Promise.resolve();

  /**
   * @param {object} opts
   * @param {string} opts.subscriptionId
   * @param {(req: { method: string, url: string, body: object }) => Promise<any>} opts.request -
   *   sends the request and returns the parsed body; throws on any non-200 response
   * @param {import('@taskcluster/lib-monitor').Monitor} opts.monitor
   */
  constructor({ subscriptionId, request, monitor }) {
    this.subscriptionId = subscriptionId;
    this.request = request;
    this.monitor = monitor;
  }

  /**
   * Return copies of `configs` with each Spot launch config's weight scaled by its cached score.
   * `configs` is not modified. This never waits for Azure: a missing or expired score is
   * refreshed in the background and used from the next provisioning loop on.
   *
   * @param {{ workerPoolId: string, toSpawn: number, configs: import('../../launch-config-selector.js').WeightedConfig[] }} opts
   */
  adjustWeights({ workerPoolId, toSpawn, configs }) {
    const targets = configs.map(({ launchConfig, remainingCapacity }) => {
      const cfg = launchConfig.configuration;
      const target = spotTarget(cfg);
      if (!target) {
        return null;
      }
      // the selector never gives a config more than its remaining capacity
      const capacity = Math.min(toSpawn, remainingCapacity);
      const vms = Math.ceil(capacity / (cfg.workerManager?.capacityPerInstance ?? cfg.capacityPerInstance ?? 1));
      // shortcut: round the VM count up to a power of two so the cache is reused across loops, use exact counts if scores look off
      return { ...target, count: 2 ** Math.ceil(Math.log2(Math.max(vms, 1))) };
    });
    this.#refresh(
      workerPoolId,
      targets.filter(t => t)
    );
    return configs.map((cfg, i) => {
      const score = targets[i] && this.cache.get(scoreKey(targets[i]))?.score;
      return { ...cfg, weight: cfg.weight * (SCORE_WEIGHTS[score] ?? 1) };
    });
  }

  /**
   * Start a background fetch for targets without an unexpired cache entry.
   *
   * @param {string} workerPoolId
   * @param {{ location: string, sku: string, count: number }[]} targets
   */
  #refresh(workerPoolId, targets) {
    const now = Date.now();
    const missing = _.uniqBy(
      targets.filter(t => !(this.cache.get(scoreKey(t))?.expires > now)),
      scoreKey
    );
    if (!missing.length) {
      return;
    }
    // reserve the keys so later loops do not request them again while this fetch is running;
    // an expired score is served until the fetch replaces or clears it
    for (const t of missing) {
      const key = scoreKey(t);
      this.cache.set(key, { expires: now + TTL_MS, score: this.cache.get(key)?.score });
    }
    // one fetch at a time, in order
    this.refreshing = this.refreshing
      .then(() => this.#fetch(workerPoolId, missing))
      .catch(err => this.monitor.reportError(err));
  }

  /**
   * Fetch scores for `missing` and store them. A failed request is logged and stored as
   * "no score", so those launch configs keep their weights until the entry expires.
   *
   * @param {string} workerPoolId
   * @param {{ location: string, sku: string, count: number }[]} missing
   */
  async #fetch(workerPoolId, missing) {
    const subscriptionId = encodeURIComponent(this.subscriptionId);

    for (const [count, group] of Object.entries(_.groupBy(missing, 'count'))) {
      const desiredCount = Number(count);
      // the API accepts at most 8 regions and 5 VM sizes per request
      for (const desiredLocations of _.chunk(_.uniq(group.map(t => t.location)), 8)) {
        const inRegions = group.filter(t => desiredLocations.includes(t.location));
        for (const skus of _.chunk(_.uniq(inRegions.map(t => t.sku)), 5)) {
          // the pairs this request was made for; it also returns other region/size combinations
          const requested = inRegions.filter(t => skus.includes(t.sku)).map(scoreKey);
          const fetched = new Map();
          try {
            const body = await this.request({
              method: 'POST',
              url:
                `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Compute` +
                `/locations/${encodeURIComponent(desiredLocations[0])}/placementScores/spot/generate?api-version=2025-06-05`,
              body: {
                desiredLocations,
                desiredSizes: skus.map(sku => ({ sku })),
                desiredCount,
                availabilityZones: false,
              },
            });
            for (const { region, sku, score, isQuotaAvailable } of body?.placementScores ?? []) {
              const key = scoreKey({ location: region, sku, count: desiredCount });
              fetched.set(key, isQuotaAvailable === false ? 'InsufficientQuota' : score);
            }
            this.monitor.info({
              message: 'Azure spot placement scores',
              workerPoolId,
              desiredCount,
              scores: Object.fromEntries(fetched),
            });
          } catch (err) {
            this.monitor.warning({
              message: 'Azure spot placement score request failed; launch config weights are not changed',
              workerPoolId,
              desiredLocations,
              skus,
              desiredCount,
              error: err.message,
            });
          }
          // store every score that came back, and clear the requested pairs that got none (a failed
          // request, or a pair missing from the response) so a reserved stale score is not kept.
          // Other pairs in the batch are left alone: a failure must not erase their unexpired scores.
          const expires = Date.now() + TTL_MS;
          for (const key of new Set([...requested, ...fetched.keys()])) {
            this.cache.set(key, { expires, score: fetched.get(key) });
          }
        }
      }
    }
  }
}
