var fs = require('fs');

module.exports = function linuxProvider() {
  var sysinfo = require('../../sysinfo.js')();
  var historyCpuUsage = {};

  return {
    lookup: lookup,
    clearHistory: clearHistory
  };

  function lookup(pid, options, callback) {
    if(typeof options == 'function') {
        callback = options;
        options = {};
    }
    options = options || {};

    var uptime;
    getUptime(function(err, value) {
      if(err) {
        callback(err);
      } else {
        uptime = value;
        getProcStat(pid, calculateUsage);
      }
    });

    function calculateUsage(err, stat) {
      if(err) {
        callback(err);
      } else {
        var usageData = {
          memory: calculateMemoryUsage(sysinfo, stat)
        };

        if(historyCpuUsage[pid] && options.keepHistory) {
          usageData['cpu'] = calculateCpuUsageFromHistory(sysinfo, uptime, stat, historyCpuUsage[pid]);
        } else {
          usageData['cpu'] = calculateCpuUsage(sysinfo, uptime, stat);
        }

        if(options.keepHistory) {
          //save totalTime in history
          historyCpuUsage[pid] = {
            timestamp: Date.now(),
            stat: stat,
            uptime: uptime
          };
        }

        callback(null, usageData);
      }
    }
  };

  function clearHistory (pid) {
    if(pid) {
      if(historyCpuUsage[pid]) {
        historyCpuUsage[pid] = null;
      }
    } else {
      historyCpuUsage = {};
    }
  }
};

function calculateCpuUsage(sysinfo, uptime, stat) {
  var totalTime = (stat.stime + stat.utime) / sysinfo.HERTZ;
  var processUptime = uptime - stat.startTime / sysinfo.HERTZ;
  var pcpu = (totalTime / processUptime) * 100;
  return pcpu;
}

function calculateCpuUsageFromHistory(sysinfo, uptime, stat, lastUsage) {
  var totalTime = (stat.stime + stat.utime) / sysinfo.HERTZ;
  var lastTotalTime = (lastUsage.stat.stime + lastUsage.stat.utime) / sysinfo.HERTZ;

  var usedTimeSinceLast = totalTime - lastTotalTime;
  var timeSpent = uptime - lastUsage.uptime;

  var pcpu = (usedTimeSinceLast / timeSpent) * 100;
  return pcpu;
}

function calculateMemoryUsage(sysinfo, stat) {
  return stat.rss * sysinfo.PAGE_SIZE;
}

function getUptime(callback) {
  fs.readFile('/proc/uptime', 'utf8', function(err, data) {
    if(err) {
      callback(err);
    } else {
      var matched = data.match(/^(.*) /);
      if(matched) {
        var uptime = parseFloat(matched[1]);
        callback(null, uptime);
      } else {
        callback(new Error('Invalid formatted uptime file'));
      }
    }
  });
}

var STAT_INDEXES = {
  STIME: 11,
  UTIME: 12,
  START_TIME: 19,
  RSS: 21
};

function getProcStat(pid, callback) {
  var fileName = '/proc/' + pid + '/stat';
  fs.readFile(fileName, 'utf8', function(err, data) {
    if(err) {
      callback(err);
    } else {
      data = data.substr(data.lastIndexOf(')') + 2);
      var parts = data.split(' ');
      var statObject = {
        stime: parseFloat(parts[STAT_INDEXES.STIME]),
        utime: parseFloat(parts[STAT_INDEXES.UTIME]),
        startTime: parseFloat(parts[STAT_INDEXES.START_TIME]),
        rss: parseFloat(parts[STAT_INDEXES.RSS])
      };
      callback(null, statObject);
    }
  });
}
