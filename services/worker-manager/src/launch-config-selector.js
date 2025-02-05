import assert from 'assert';

import { WorkerPoolLaunchConfig } from './data.js';

/** @typedef {{ launchConfig: WorkerPoolLaunchConfig, weight: number }} WeightedConfig */

/**
 * A class to select a launch config based on a weighted random selection.
 * The weight of each launch config is determined by the initial weight.
 * The higher the initial weight, the more likely the launch config will be selected.
 */
class WeightedRandomConfig {
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
        return config.launchConfig;
      }
    }

    // likely not to happen but just in case
    return this.configs[this.configs.length - 1].launchConfig;
  }

  getAll() {
    return this.configs.map(({ launchConfig }) => launchConfig);
  }

  /**
   * @param {number} toSpawn
   * @returns {WorkerPoolLaunchConfig[]}
   */
  selectCapacity(toSpawn) {
    // during selection, should we adjust the weights as we go?
    // we might hit the max capacity so we cannot select it more than we do..
    // at least removing from the list?
    const configs = [];
    while (toSpawn) {
      const cfg = this.getRandomConfig();
      if (!cfg) {
        break;
      }

      configs.push(cfg);
      toSpawn -= cfg.configuration.workerManager?.capacityPerInstance ?? cfg?.configuration.capacityPerInstance ?? 1;
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
   * @param {object} options.db
   * @param {{ alert: Function } &object} options.monitor
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
    const launchConfigs = await this.loadLaunchConfigs(workerPool);
    const configsWithWeights = launchConfigs.map((launchConfig) => ({
      launchConfig,
      weight: launchConfig.initialWeight,
    }));

    // if stats are given we can adjust weights accordingly
    if (workerPoolStats !== undefined) {
      for (const cfg of configsWithWeights) {
        // Lower the weight if max capacity is set
        const maxCapacity = cfg.launchConfig.maxCapacity;
        const existingCapacity = workerPoolStats.capacityByLaunchConfig.get(workerPool.workerPoolId) || 0;
        if (maxCapacity > 0 && existingCapacity > 0) {
          cfg.weight -= existingCapacity / maxCapacity;
        }

        const errorsCount = workerPoolStats.errorsByLaunchConfig.get(workerPool.workerPoolId) || 0;
        const totalErrors = workerPoolStats.totalErrors;
        if (errorsCount > 0 && totalErrors > 0) {
          // decrease likelihood proportionally to the errors count
          cfg.weight -= errorsCount / totalErrors;
        }
      }
    }

    return new WeightedRandomConfig(configsWithWeights);
  }

  /**
   * @param {import('./data.js').WorkerPool} workerPool
   * @returns {Promise<WorkerPoolLaunchConfig[]>}
   */
  async loadLaunchConfigs(workerPool) {
    const launchConfigs = await WorkerPoolLaunchConfig.load(
      this.db,
      workerPool.workerPoolId,
    );

    if (launchConfigs.length === 0) {
      this.monitor.alert('No launch configs found for worker pool');
    }
    return launchConfigs;
  }
}
