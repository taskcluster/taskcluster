import assert from 'assert';

import { WorkerPoolLaunchConfig } from './data.js';

/** @typedef {{ launchConfig: WorkerPoolLaunchConfig, weight: number, remainingCapacity: number }} WeightedConfig */

/**
 * A class to select a launch config based on a weighted random selection.
 * The weight of each launch config is determined by the initial weight.
 * The higher the initial weight, the more likely the launch config will be selected.
 */
export class WeightedRandomConfig {
  /** @type {WeightedConfig[]} */
  configs = [];

  /** @type {Number} */
  totalWeight = 0;

  /**
   * @param {WeightedConfig[]} cfgs
   */
  constructor(cfgs = []) {
    for (const config of cfgs) {
      if (config.weight > 0) {
        this.addConfig(config);
      }
    }
  }

  /**
   * @param {WeightedConfig} config
   */
  addConfig(config) {
    this.totalWeight += config.weight;
    this.configs.push(config);
    // sorting is needed for the algorithm to select random based on cumulative weight
    this.configs.sort((a, b) => a.weight - b.weight);
  }

  getRandomConfig() {
    if (this.totalWeight === 0) {
      return null;
    }

    const random = Math.random() * this.totalWeight;
    let cumulativeWeight = 0;
    for (const config of this.configs) {
      cumulativeWeight += config.weight;
      if (random < cumulativeWeight) {
        return config;
      }
    }

    // likely not to happen but just in case
    return this.configs[this.configs.length - 1];
  }

  /**
   * During selection config might exceed maxCapacity and would have to be removed from the list
   * @param {WeightedConfig} config
   */
  #removeConfig(config) {
    // delete config from the list
    // and adjust the total weight
    const index = this.configs.indexOf(config);
    this.totalWeight -= config.weight;
    this.configs.splice(index, 1);
  }

  getAll() {
    return this.configs.map(({ launchConfig }) => launchConfig);
  }

  /**
   * @param {number} toSpawn
   * @returns {WorkerPoolLaunchConfig[]}
   */
  selectCapacity(toSpawn) {
    const configs = [];
    while (toSpawn > 0) {
      const cfg = this.getRandomConfig();
      if (!cfg) {
        break;
      }

      const lc = cfg.launchConfig;
      configs.push(lc);
      const selectedCapacity = lc.configuration.workerManager?.capacityPerInstance
        ?? lc?.configuration.capacityPerInstance
        ?? 1;
      toSpawn -= selectedCapacity;
      cfg.remainingCapacity -= selectedCapacity;

      if (cfg.remainingCapacity <= 0) {
        this.#removeConfig(cfg);
      }
    }
    return configs;
  }
}

/**
 * A class to load launch configs for particular worker pool
 * and prepare them for selection based on weighted random selection.
 */
export class LaunchConfigSelector {
  /**
   * @param {object} options
   * @param {import('@taskcluster/lib-postgres').Database} options.db
   * @param {{ debug: Function, log: { launchConfigSelectorsDebug: Function } } &object} options.monitor
   */
  constructor({ db, monitor }) {
    assert(db, 'db is required');
    assert(monitor, 'monitor is required');

    this.db = db;
    this.monitor = monitor;
  }

  /**
   * Fetch all launch configurations for a worker pool
   * and return a weighted random config selector
   * that would return launch configs with probability
   * that is proportional to its weight (initialWeight + adjustedWeight)
   *
   * If workerPoolStats are passed, launch config's
   * initial weights would be adjusted proportionally to the number
   * of errors and existing capacity
   *
   * Launch configs with initial or adjusted weight of 0 would not be returned
   *
   * @param {import('./data.js').WorkerPool} workerPool
   * @param {import('./data.js').WorkerPoolStats} [workerPoolStats]
   */
  async forWorkerPool(workerPool, workerPoolStats) {
    const launchConfigs = await this.#loadLaunchConfigs(workerPool);
    const wpMaxCapacity = workerPool.config.maxCapacity;
    const configsWithWeights = launchConfigs.map((launchConfig) => ({
      launchConfig,
      weight: launchConfig.initialWeight,
      remainingCapacity: launchConfig.configuration?.workerManager?.maxCapacity ?? wpMaxCapacity,
    }));

    // if stats are given we can adjust weights accordingly
    if (workerPoolStats !== undefined) {
      for (const cfg of configsWithWeights) {
        // Lower the weight if max capacity is set
        const maxCapacity = cfg.launchConfig.configuration?.workerManager?.maxCapacity ?? wpMaxCapacity;
        const existingCapacity = workerPoolStats.capacityByLaunchConfig.get(cfg.launchConfig.launchConfigId) || 0;
        if (maxCapacity > 0 && existingCapacity > 0) {
          cfg.weight -= existingCapacity / maxCapacity;

          // to respect maxCapacity we need to know how much more we can spawn
          // unlike the estimator, which allows slight over-provision for the whole worker pool
          // this limit is hard for the given launch config
          // So if all launch configs in a worker pool have maxCapacity set, it would unlikely to over-provision
          cfg.remainingCapacity = Math.max(0, maxCapacity - existingCapacity);
        }

        const errorsCount = workerPoolStats.errorsByLaunchConfig.get(cfg.launchConfig.launchConfigId) || 0;
        const totalErrors = workerPoolStats.totalErrors;
        if (errorsCount > 0 && totalErrors > 0) {
          // decrease likelihood proportionally to the errors count
          cfg.weight -= errorsCount / totalErrors;
        }
      }

      // ensure single viable configs can spawn even with adjusted weight <= 0
      // this prevents starvation for single-LC pools while preserving multi-LC balancing
      const MIN_WEIGHT = 0.01;
      for (const cfg of configsWithWeights) {
        if (cfg.remainingCapacity > 0 && cfg.weight <= 0) {
          const otherViableConfigs = configsWithWeights.filter(c =>
            c !== cfg && c.remainingCapacity > 0 && c.weight > 0,
          );

          if (otherViableConfigs.length === 0) {
            // this is the only config with remaining capacity
            cfg.weight = MIN_WEIGHT;
          } else {
            cfg.weight = 0;
          }
        }
      }
    }

    this.monitor.log.launchConfigSelectorsDebug({
      workerPoolId: workerPool.workerPoolId,
      weights: Object.fromEntries(configsWithWeights.map(
        ({ launchConfig, weight }) => [launchConfig.launchConfigId, weight]),
      ),
      remainingCapacity: Object.fromEntries(configsWithWeights.map(
        ({ launchConfig, remainingCapacity }) => [launchConfig.launchConfigId, remainingCapacity]),
      ),
    });

    return new WeightedRandomConfig(configsWithWeights);
  }

  /**
   * @param {import('./data.js').WorkerPool} workerPool
   * @returns {Promise<WorkerPoolLaunchConfig[]>}
   */
  async #loadLaunchConfigs(workerPool) {
    const launchConfigs = await WorkerPoolLaunchConfig.load(
      this.db,
      workerPool.workerPoolId,
    );

    if (launchConfigs.length === 0) {
      this.monitor.debug(`No launch configs found for worker pool ${workerPool.workerPoolId}`);
    }
    return launchConfigs;
  }
}
