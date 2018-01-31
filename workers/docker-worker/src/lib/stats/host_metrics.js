const diskspace = require('diskspace');
const os = require('os');

function getCPUStats() {
  let totalTimes = {};
  os.cpus().forEach((cpu) => {
    Object.keys(cpu.times).forEach((timing) => {
      if (!(timing in totalTimes)) {
        totalTimes[timing] = 0;
      }
      totalTimes[timing] += cpu.times[timing];
    });
  });

  return totalTimes;
}

module.exports = function (config) {
  let stats = config.stats;
  let dockerVolume = config.dockerVolume;

  let freeMem = os.freemem();
  let totalMem = os.totalmem();
  stats.measure('memory.free', freeMem);
  stats.measure('memory.total', totalMem);
  stats.measure('memory.used', totalMem - freeMem);

  stats.measure('uptime', os.uptime());

  let cpuStats = getCPUStats();
  let totalCPUTime = 0;
  let loadTime = 0;

  Object.keys(cpuStats).forEach((timing) => {
    totalCPUTime += cpuStats[timing];
    if (timing !== 'idle') {
      loadTime += cpuStats[timing];
    }
  });

  stats.measure('cpu.used', (loadTime / totalCPUTime) * 100);

  diskspace.check(dockerVolume, (err, total, free) => {
    if (err) {
      console.log(`Error checking free diskspace. ${err.message}`);
      return;
    }
    stats.measure('hd.total', total);
    stats.measure('hd.free', free);
    stats.measure('hd.used', total - free);
  });
};
