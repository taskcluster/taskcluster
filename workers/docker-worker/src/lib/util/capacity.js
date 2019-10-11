var diskspace = require('diskspace');

module.exports = {
  exceedsDiskspaceThreshold(mnt, threshold, availableCapacity, log, monitor) {
    return new Promise(function (accept, reject) {
      diskspace.check(mnt, function (err, total, free, status) {
        var used = total-free;
        var capacity = (100*(used/total)).toPrecision(5);

        // Always sure we have at last a minimum capacity when checking diskspace
        // threshold.  Not only does this provide some buffer, but also allow
        // diskspace to be cleaned up if currently running at max capacity.
        availableCapacity = Math.max(1, availableCapacity);
        var thresholdReached = free <= (threshold * availableCapacity);
        if (thresholdReached) {
          monitor.count('diskspaceThreshold');
          log('[alert-operator] diskspace threshold reached', {
            volume: mnt,
            free: free,
            total: total,
            used: total-free,
            pctUsed: capacity,
            perTaskThreshold: threshold,
            availableWorkerCapacity: availableCapacity,
            totalthreshold: threshold * availableCapacity
          });
        }
        accept(thresholdReached);
      });
    });
  }
};
