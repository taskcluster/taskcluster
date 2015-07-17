import assert from 'assert';
import base from 'taskcluster-base';
import Debug from 'debug';

let debug = Debug('taskcluster-docker-worker:stats');

import * as series from './series';

export default class Stat {
  constructor(config) {
    assert(config.influx, 'Must supply an influx configuration');
    assert(config.workerId, 'Worker ID is required');
    assert(config.workerType, 'Worker type is required');
    assert(config.workerGroup, 'Worker group is required');
    assert(config.workerNodeType, 'Worker instance type is required');
    assert(config.provisionerId, 'Provisioner ID is required');

    if (config.influx.connectionString) {
      this.influx = new base.stats.Influx(config.influx);
    }
    else {
      this.influx = {
        addPoint: (...args) => { debug('stats: %j', args); }
      };
    }
    this.reporters = {};

    Object.keys(series).forEach((seriesName) => {
      this.reporters[seriesName] =
        series[seriesName].reporter(
          this.influx,
          {
            workerId: config.workerId,
            workerGroup: config.workerGroup,
            workerType: config.workerType,
            instanceType: config.workerNodeType,
            provisionerId: config.provisionerId,
            capacity: config.capacity
          }
        );
    });
  }

  /**
   * Flushes data and closes influxdb connection.
   */
  close() {
    this.influx.close();
  }

  /**
   * Records a time series entry that will be reported to influx.
   *
   * @param {String} seriesName - name of the series
   * @param {Object|Number|String} value - Value to supply for the series.
   */
  record(seriesName, value=1) {
    let stat = value;
    if (typeof value !== 'object') {
      stat = {'value': value};
    }

    this.reporters[seriesName](stat);
  }

  /**
   * Add a new entry with a duration based on the startTime provided and
   * current time.
   *
   * @param {String} seriesName - name of the series
   * @param {Number} startTime - Time that the event started
   */
  time(seriesName, startTime) {
    let endTime = Date.now();
    let duration = endTime - startTime;
    this.record(seriesName, duration);
  }

  /**
  Timer helper it takes a generator (or any yiedable from co) and times
  the runtime of the action and issues timing metrics to influx.

  @param {String} seriesName statistic name.
  @param {Generator|Function|Promise} generator or yieldable.
  */
  async timeGen(seriesName, fn, points={}) {
    let start = Date.now();
    let result = await fn;

    let stat = {
      duration: Date.now() - start
    };

    this.record(seriesName, Object.assign({}, stat, points));

    return result;
  }
}
