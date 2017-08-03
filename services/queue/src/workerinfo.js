let taskcluster = require('taskcluster-client');
let assert      = require('assert');
let debug       = require('debug')('workerinfo');

class WorkerInfo {
  constructor(options) {
    assert(options);
    assert(options.Provisioner);
    this.Provisioner = options.Provisioner;

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

  async provisionerSeen(provisionerId) {
    await this.valueSeen(provisionerId, async () => {
      let expires = taskcluster.fromNow('5 days');  // temporary hard coded expiration

      // perform an Azure upsert, trying the update first as it is more common
      let provisioner = await this.Provisioner.load({provisionerId}, true);
      if (provisioner) {
        await provisioner.modify(entity => {
          if (Date.now() - new Date(entity.expires) > 24 * 60 * 60 * 1000) {
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
  }

  async expire(now) {
    let count;

    debug('Expiring provisioners at: %s, from before %s', new Date(), now);
    count = await this.Provisioner.expire(now);
    debug('Expired %s provisioners', count);
  }
}

module.exports = WorkerInfo;
