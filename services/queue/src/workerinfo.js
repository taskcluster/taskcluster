const taskcluster = require('taskcluster-client');
const assert = require('assert');
const debug = require('debug')('workerinfo');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

const { Provisioner, Worker, WorkerType } = require('./data');

const DAY = 24 * 60 * 60 * 1000;
const RECENT_TASKS_LIMIT = 20;

const expired = expires => Date.now() > new Date(expires) - DAY;
const shouldUpdateLastDateActive = lastDateActive => Date.now() - new Date(lastDateActive) > DAY / 4;

class WorkerInfo {
  constructor(options) {
    assert(options);
    assert(options.db);
    this.db = options.db;

    // update `expires` values in postgres at this frequency; larger values give less accurate
    // expires times, but reduce database traffic.
    this.updateFrequency = '6 hours';
    this.nextUpdateAt = {};
  }

  /**
   * Mark a value as seen, only actually updating the postgres table row
   * occasionally. This takes the approach of updating the row immediately on
   * the first call, then not updating until `updateFrequency` has elapsed.
   * Thus the `expires` value on a row may be out-of-date by `updateFrequency`.
   *
   * Note that the cache is never purged of outdated entries; this assumes that
   * the process is restarted on a daily
   * basis, so there is not too much time
   * for stale cache entries to accumulate.
   */
  async valueSeen(key, updateExpires) {
    let now = new Date();
    let nextUpdate = this.nextUpdateAt[key];
    if (!nextUpdate || nextUpdate < now) {
      this.nextUpdateAt[key] = taskcluster.fromNow(this.updateFrequency);

      await updateExpires();
    }
  }

  async seen(provisionerId, workerType, workerGroup, workerId) {
    const newExpiration = workerId ? taskcluster.fromNow('1 day') : taskcluster.fromNow('5 days');
    const expires = new Date();
    const promises = [];
    // provisioner seen
    if (provisionerId) {
      promises.push(this.valueSeen(provisionerId, async () => {
        let provisioner = await Provisioner.get(this.db, provisionerId, expires);
        if (provisioner) {
          return provisioner.update(this.db, {
            expires: expired(provisioner.expires) ? newExpiration : provisioner.expires,
            lastDateActive: shouldUpdateLastDateActive(
              provisioner.lastDateActive) ? new Date() : provisioner.lastDateActive,
          });
        }
        provisioner = await Provisioner.fromApi(provisionerId, {
          provisionerId,
          expires: newExpiration,
          lastDateActive: new Date(),
          description: '',
          stability: 'experimental',
          actions: [],
        });
        try {
          await provisioner.create(this.db);
        } catch (err) {
          if (err.code !== UNIQUE_VIOLATION) {
            throw err;
          }
        }
      }));
    }

    // worker-type seen
    if (provisionerId && workerType) {
      promises.push(this.valueSeen(`${provisionerId}/${workerType}`, async () => {
        // perform an Azure upsert, trying the update first as it is more common
        let wType = await WorkerType.get(this.db, provisionerId, workerType, expires);

        if (wType) {
          return wType.update(this.db, {
            expires: expired(wType.expires) ? newExpiration : wType.expires,
            lastDateActive: shouldUpdateLastDateActive(wType.lastDateActive) ? new Date() : wType.lastDateActive,
          });
        }

        wType = await WorkerType.fromApi(workerType, {
          workerType,
          provisionerId,
          expires: newExpiration,
          lastDateActive: new Date(),
          description: '',
          stability: 'experimental',
        });
        try {
          await wType.create(this.db);
        } catch (err) {
          if (err.code !== UNIQUE_VIOLATION) {
            throw err;
          }
        }
      }));
    }

    // worker seen
    if (provisionerId && workerType && workerGroup && workerId) {
      promises.push(this.valueSeen(`${provisionerId}/${workerType}/${workerGroup}/${workerId}`, async () => {
        // perform an Azure upsert, trying the update first as it is more common
        let worker = await Worker.get(this.db, provisionerId, workerType, workerGroup, workerId, expires);

        if (worker) {
          let rows = await worker.update(this.db, { expires: newExpiration });
          return Worker.fromDbRows(rows);
        }

        worker = Worker.fromApi(workerId, {
          provisionerId,
          workerType,
          workerGroup,
          expires: newExpiration,
          recentTasks: [],
          quarantineUntil: new Date(),
          firstClaim: new Date(),
        });
        try {
          await worker.create(this.db);
        } catch (err) {
          if (err.code !== UNIQUE_VIOLATION) {
            throw err;
          }
        }
      }));
    }

    await Promise.all(promises);
  }

  async expire(now) {
    let count;

    debug('Expiring provisioners at: %s, from before %s', new Date(), now);
    count = await this.db.fns.expire_queue_provisioners(now);
    debug('Expired %s provisioners', count);

    debug('Expiring worker-types at: %s, from before %s', new Date(), now);
    count = await this.db.fns.expire_queue_worker_types(now);
    debug('Expired %s worker-types', count);

    debug('Expiring workers at: %s, from before %s', new Date(), now);
    count = await this.db.fns.expire_queue_workers(now);
    debug('Expired %s workers', count);
  }

  async taskSeen(provisionerId, workerType, workerGroup, workerId, tasks) {
    if (!tasks.length) {
      return;
    }

    // Keep track of most recent tasks of a worker
    const worker = await Worker.get(this.db, provisionerId, workerType, workerGroup, workerId, new Date());

    if (!worker || worker.quarantineUntil.getTime() > new Date().getTime()) {
      return;
    }

    const recentTasks = [
      ...worker.recentTasks,
      ...tasks.map(({ status }) => ({ taskId: status.taskId, runId: status.runs.length - 1 })),
    ].slice(-RECENT_TASKS_LIMIT);
    await worker.update(this.db, { recentTasks });
  }

  async upsertProvisioner({ provisionerId, stability, description, actions, expires }) {
    let provisioner = await Provisioner.get(this.db, provisionerId, new Date());
    let result;
    if (provisioner) {
      let rows = await provisioner.update(this.db, {
        expires: new Date(expires || provisioner.expires),
        description: description || provisioner.description,
        stability: stability || provisioner.stability,
        actions: actions || provisioner.actions || [],
      });
      result = Provisioner.fromDbRows(rows);
    } else {
      provisioner = await Provisioner.fromApi(provisionerId, {
        provisionerId,
        expires: new Date(expires || taskcluster.fromNow('5 days')),
        lastDateActive: new Date(),
        description: description || '',
        stability: stability || 'experimental',
        actions: actions || [],
      });
      try {
        await provisioner.create(this.db);
      } catch (err) {
        if (err.code !== UNIQUE_VIOLATION) {
          throw err;
        }
      }
      result = provisioner;
    }

    return result;
  }

  async upsertWorkerType({ provisionerId, workerType, stability, description, expires }) {
    let wType = await WorkerType.get(this.db, provisionerId, workerType, new Date());
    let result;

    if (wType) {
      let rows = await wType.update(this.db, {
        stability: stability || wType.stability,
        description: description || wType.description,
        expires: expires || wType.expires,
      });
      result = WorkerType.fromDbRows(rows);
    } else {
      wType = await WorkerType.fromApi(workerType, {
        workerType,
        provisionerId,
        expires: new Date(expires || taskcluster.fromNow('5 days')),
        lastDateActive: new Date(),
        description: description || '',
        stability: stability || 'experimental',
      });
      try {
        await wType.create(this.db);
      } catch (err) {
        if (err.code !== UNIQUE_VIOLATION) {
          throw err;
        }
      }
      result = wType;
    }

    return result;
  }

  async upsertWorker({ provisionerId, workerType, workerGroup, workerId, expires }) {
    let worker = await Worker.get(this.db, provisionerId, workerType, workerGroup, workerId, new Date());
    let result;

    if (worker) {
      let rows = await worker.update(this.db, { expires });
      result = Worker.fromDbRows(rows);
    } else {
      worker = Worker.fromApi(workerId, {
        provisionerId,
        workerType,
        workerGroup,
        workerId,
        recentTasks: [],
        expires: expires || taskcluster.fromNow('1 day'),
        quarantineUntil: new Date(),
        firstClaim: new Date(),
      });
      try {
        await worker.create(this.db);
      } catch (err) {
        if (err.code !== UNIQUE_VIOLATION) {
          throw err;
        }
      }
      result = worker;
    }

    return result;
  }
}

module.exports = WorkerInfo;
