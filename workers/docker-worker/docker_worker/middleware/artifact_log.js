var temporary = require('temporary');
var fs        = require('fs');
var request   = require('superagent');
var Promise   = require('promise');
var debug     = require('debug')('taskcluster-docker-worker:ArtifactLogger');

var LOGNAME = 'terminal-artifact.log';

/** Construct an instance of ArtifactLogger */
var ArtifactLogger = function() {
  this._file = new temporary.File();
  debug('Created ArtifactLogger using tempfile: ' + this._file.path);
};

/** Declare a log and  attach to stdout */
ArtifactLogger.prototype.declareLogs = function(logs, taskRun, dockerProcess) {
  // Pipe stdout to temporary file
  this.stream = fs.createWriteStream(this._file.path);
  dockerProcess.stdout.pipe(this.stream);

  // Fetch artifact PUT URLs
  var urlRequest = {};
  urlRequest[LOGNAME] = {
    contentType:                'text/plain'
  };
  var gotArtifactPutUrls = taskRun.getArtifactPutUrls(urlRequest);

  // Add artifact URL to declared logs
  return gotArtifactPutUrls.then(function(artifactUrls) {
    logs[LOGNAME] = artifactUrls[LOGNAME].artifactUrl;
    return logs;
  });
};

/** Extract artifacts */
ArtifactLogger.prototype.extractResult = function(result, taskRun,
                                                  dockerProcess) {
  var that = this;
  var fileClosed = new Promise(
    function(accept, reject) {
      if (this.stream.closed)
        return accept();
      this.stream.once('close', accept);
      this.stream.once('error', reject);
    }.bind(this)
  );

  return fileClosed.then(function() {
    // Fetch artifact PUT URLs
    var urlRequest = {};
    urlRequest[LOGNAME] = {
      contentType:                'text/plain'
    };

    // Get log file size
    var gotLogSize = new Promise(function(accept, reject) {
      fs.stat(that._file.path, function(err, stat) {
        if (err) {
          return reject(err);
        }
        accept(stat.size);
      });
    });

    return Promise.all(taskRun.getArtifactPutUrls(urlRequest), gotLogSize);
  }).then(function(val) {
    return new Promise(function(accept, reject) {
      var artifactUrls  = val.shift();
      var size          = val.shift();


      var urls = artifactUrls[LOGNAME];
      var req = request
                  .put(urls.artifactPutUrl)
                  .set('Content-Type',    urls.contentType)
                  .set('Content-Length',  size);
      fs.createReadStream(that._file.path).pipe(req, {end: false});
      req.end(function(res) {
        if (!res.ok) {
          debug("Failed to upload " + LOGNAME);
          return reject(new Error("Upload of artifact log failed: " + res.text));
        }
        result.artifacts[LOGNAME] = urls.artifactUrl;
        accept();
      });
    });
  }).then(function() {
    return new Promise(function(accept, reject) {
      that._file.unlink(function(err) {
        if (err)
          return reject(err);
        accept();
      });
    });
  }).then(function() {
    return result;
  });
};

/** Create an instance of ArtifactLogger */
var ArtifactLogBuilder = function(flag) {
  if (flag) {
    return new ArtifactLogger();
  }
  return null;
};

ArtifactLogBuilder.featureFlagName    = 'artifactLog';
ArtifactLogBuilder.featureFlagDefault = false;

module.exports = ArtifactLogBuilder;
