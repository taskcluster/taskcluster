import assert from 'assert';

import { WorkerPoolLaunchConfig } from './data.js';

/**
* A class to select a launch config based on a weighted random selection.
* The weight of each launch config is determined by the initial weight.
* The higher the initial weight, the more likely the launch config will be selected.
*/
class WeightedRandomConfig {
  constructor(launchConfigs = []) {
    this.configs = [];
    this.totalWeight = 0;

    if (launchConfigs.length) {
      for (const config of launchConfigs) {
        this.addConfig(config, config?.workerManager?.initialWeight || 1);
      }
    }
  }

  addConfig(config, weight) {
    this.totalWeight += weight;
    this.configs.push(config);
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

  getAll() {
    return this.configs;
  }

  selectCapacity(toSpawn) {
    const configs = [];
    while (toSpawn) {
      const cfg = this.getRandomConfig();
      if (!cfg) {
        break;
      }

      configs.push(cfg);
      toSpawn -= cfg?.workerManager?.capacityPerInstance ?? cfg?.capacityPerInstance ?? 1;
    }
    return configs;
  }
}

/**
* A class to load launch configs for particular worker pool
* and prepare them for selection based on weighted random selection.
*/
export class LaunchConfigSelector {
  constructor({ db, monitor }) {
    assert(db, 'db is required');
    assert(monitor, 'monitor is required');

    this.db = db;
    this.monitor = monitor;
  }

  forWorkerPool(workerPool) {
    const launchConfigs = this.loadLaunchConfigs(workerPool);

    // TODO: fetch workers stats - launchConfig/state/count information
    //    to take into account for maxCapacity
    //    to increase weight for the ones with lower existing capacity
    // TODO: fetch worker pool errors - launchConfigs/errors counts for the past X minutes ( XXX??? )
    // TODO: sort by initalWeight

    return new WeightedRandomConfig(launchConfigs);
  }

  async loadLaunchConfigs(workerPool) {
    let launchConfigs = await WorkerPoolLaunchConfig.load(
      this.db,
      workerPool.workerPoolId,
      workerPool.providerId,
    );
    launchConfigs = launchConfigs.filter((cfg) => cfg.isPaused === false);

    if (launchConfigs.length === 0) {
      this.monitor.alert('No launch configs found for worker pool');
    }
    return launchConfigs;
  }
}
