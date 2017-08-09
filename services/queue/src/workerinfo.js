let taskcluster = require('taskcluster-client');
let assert      = require('assert');
let debug       = require('debug')('workerinfo');

class WorkerInfo {
  constructor(options) {
    assert(options);
    assert(options.Provisioner);
    this.Provisioner = options.Provisioner;
    this.WorkerType = options.WorkerType;

    // update `expires` values in Azure at this frequency; larger values give less accurate
    // expires times, but reduce Azure traffic.
    this.updateFrequency = '6 hours';
    this.nextUpdateAt = {};
  }

  /**
   * Mark a value as seen, only actually updating the Azure table row
   * occasionally. This takes the approach of updating the row immediately on
   * the first call, then not updating until `updateFrequency` has elapsed.
   * Thus the `expires` value on a row may be out-of-date by `updateFrequency`.
   *
   * Note that the cache is never purged of outdated entries; this assumes that
   * the process is restarted on a daily basis, so there is not too much time
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

  async seen(provisionerId, workerType) {
    const expired = entity => Date.now() - new Date(entity.expires) > 24 * 60 * 60 * 1000;
    const expires = taskcluster.fromNow('5 days');  // temporary hard coded expiration

    const provisionerSeen = async (provisionerId) => {
      await this.valueSeen(provisionerId, async () => {
        // perform an Azure upsert, trying the update first as it is more common
        const provisioner = await this.Provisioner.load({provisionerId}, true);
        if (provisioner) {
          await provisioner.modify(entity => {
            if (expired(entity)) {
              entity.expires = expires;
            }
          });

          return;
        }

        try {
          await this.Provisioner.create({provisionerId, expires});
        } catch (err) {
          // EntityAlreadyExists means we raced with another create, so just let it win
          if (!err || err.code !== 'EntityAlreadyExists') {
            throw err;
          }
        }
      });
    };

    const workerTypeSeen = async (provisionerId, workerType) => {
      await this.valueSeen(`${provisionerId}/${workerType}`, async () => {
        // perform an Azure upsert, trying the update first as it is more common
        const wType = await this.WorkerType.load({provisionerId, workerType}, true);
        if (wType) {
          await wType.modify(entity => {
            if (expired(entity)) {
              entity.expires = expires;
            }
          });

          return;
        }

        try {
          await this.WorkerType.create({provisionerId, workerType, expires});
        } catch (err) {
          // EntityAlreadyExists means we raced with another create, so just let it win
          if (!err || err.code !== 'EntityAlreadyExists') {
            throw err;
          }
        }
      });
    };

    if (provisionerId) {
      provisionerSeen(provisionerId);
    }

    if (provisionerId && workerType) {
      workerTypeSeen(provisionerId, workerType);
    }
  }

  async expire(now) {
    let count;

    debug('Expiring provisioners at: %s, from before %s', new Date(), now);
    count = await this.Provisioner.expire(now);
    debug('Expired %s provisioners', count);

    debug('Expiring worker-types at: %s, from before %s', new Date(), now);
    count = await this.WorkerType.expire(now);
    debug('Expired %s worker-types', count);
  }
}

module.exports = WorkerInfo;
