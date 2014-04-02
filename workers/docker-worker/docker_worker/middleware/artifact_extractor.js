var mime          = require('mime');
var Promise       = require('promise');
var debug         = require('debug')('taskcluster-docker-worker:ArtifactExtractor');
var request       = require('superagent');

/**

Upload file given by path from within container to a putUrl,
Return a promise for reason the file is missing, or `null` if the file
uploaded successfully. The promise will only fail in case on unexpected
errors such as network, etc.

*/
var putFileFromContainer = function(container, path, putUrl, contentType) {
  var copy = Promise.denodeify(container.copy.bind(container));
  /**
  Copy will return the raw resource if asked for a single file OR a .tar.gz (uncompressed) of the requested
  folder.
  */
  return copy({ Resource: path }).then(function(res) {
    return new Promise(function(accept, reject) {
      // pipe docker file into the response...
      var req = request
        .put(putUrl)
        .set('Content-Type',    contentType)
        .set('Content-Length',  res.headers['content-length']);

      res.pipe(req);
      req.once('error', reject);
      req.once('response', function(res) {
        if (res.error) return reject(res.error);
        accept();
      });

    });
  }).catch(function(err) {
    debug("Failed to put artifact: ", err, err.stack);
    // XXX: Only S3 artifact upload failure or some terrible docker bug should
    //      cause this error.
    throw err;
  }).then(function() {
    debug("Artifact successfully uploaded!", path);
  });
};


/** Middleware for extracting artifacts */
var ArtifactExtractor = function() {
  debug("Creating artifact extractor");
};

/** Extract artifacts */
ArtifactExtractor.prototype.extractResult = function(result, taskRun,
                                                     dockerProcess) {
  // Find artifacts from task
  var artifacts = taskRun.task.payload.artifacts;
  if (!artifacts) {
    debug("Aborted artifact extraction due to missing artifacts");
    return result;
  }

  // Fetch artifact PUT URLs
  var urlRequest = {};
  for(artifact in artifacts) {
    urlRequest[artifact] = {
      contentType:        mime.lookup(artifact)
    };
  }
  var gotArtifactPutUrls = taskRun.getArtifactPutUrls(urlRequest);

  // Create result object for handling missing artifacts
  var missingArtifacts = result.result.missingArtifacts = {};
  var uploadedArtifact = result.artifacts;

  // Fetch artifacts from container
  return gotArtifactPutUrls.then(function(artifactUrls) {
    return Promise.all(Object.keys(artifacts).map(function (artifact) {
      var path = artifacts[artifact];
      var URLs = artifactUrls[artifact];
      return putFileFromContainer(
        dockerProcess.container,
        path,
        URLs.artifactPutUrl,
        URLs.contentType
      ).then(function(missingReason) {
        // Missing reasons are not reasons for failure, just reasons the file
        // didn't get uploaded, like it didn't exist
        if (missingReason) {
          missingArtifacts[artifact] = missingReason;
        } else {
          uploadedArtifact[artifact] = URLs.artifactUrl;
        }
      });
    }));
  }).then(function() {
    return result;
  });
};

/** Create an instance of ArtifactExtractor */
var ArtifactExtractorBuilder = function(flag) {
  if (flag) {
    return new ArtifactExtractor();
  }
  return null;
};

ArtifactExtractorBuilder.featureFlagName    = 'extractArtifacts';
ArtifactExtractorBuilder.featureFlagDefault = true;

module.exports = ArtifactExtractorBuilder;
