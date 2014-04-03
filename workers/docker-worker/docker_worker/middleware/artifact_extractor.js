var mime          = require('mime');
var Promise       = require('promise');
var debug         = require('debug')('taskcluster-docker-worker:ArtifactExtractor');
var fs            = require('fs');
var tar           = require('tar-stream');
var request       = require('superagent');


/**
 * Upload file given by path from within container to a putUrl,
 * Return a promise for reason the file is missing, or `null` if the file
 * uploaded successfully. The promise will only fail in case on unexpected
 * errors such as network, etc.
 */
var putFileFromContainer = function(container, path, putUrl, contentType) {
  return new Promise(function(accept, reject) {
    // Copy resource from docker container, this operation returns a TAR-stream
    container.copy({Resource: path}, function(err, res) {
      // Handle errors such as file that doesn't exist
      if (err) {
        debug("Failed to fetch artifact: ", err, err.stack);
        return accept("Failed to extract artifact from '" + path +
                      "' most likely it doesn't exist");
      }

      // Create a tar extraction stream
      var extract = tar.extract();

      // We'll track resolution as we decode the stream. This is just for
      // robustness as the API isn't well-documented and we don't like
      // undefined behavior
      var resolution = null;

      // Handle entries from the tar-stream as they occur, hopefully we'll only
      // get one entry! We can get more than one, if path is a folder. We don't
      // want to support the folder extraction use-case because we can't upload
      // to S3 before we have the size of the file we're uploading. Hence, we
      // would have to hit the host file system, which is bad karma, in that
      // case might as well tar it up inside the worker first.
      extract.on('entry', function(header, stream, next) {
        // If we've extract files before we have been given a folder, we don't
        // like that at all...
        if (resolution !== null) {
          debug("container.copy from docker gave us more than entry!");

          // This is unexpected behavior, so it's best to assume that the
          // artifact uploaded before is undefined
          resolution = {
            action:   accept,
            retval:   "Failed to extract artifact, '" + path + "' is a " +
                      "folder, please tar it up first. We only support one " +
                      "file per artifact"
          };

          // Drain the stream
          stream.resume();
          stream.on('end', function() {
            // Whatever just happened we have to keep going
            next();
          });
          return;
        }
        // Set a resolution, so that we can come past the check above. Note that
        // this resolution is also true... if suddenly the tar-stream finishes
        // right now. But this should NEVER happen
        resolution = {
          action:     reject,
          retval:     new Error("CRITICAL: Artifact upload didn't finish")
        };

        // Make a request to the
        var req = request
                    .put(putUrl)
                    .set('Content-Type',    contentType)
                    .set('Content-Length',  header.size);
        //TODO: Investigate the feasibility of setting additional custom headers
        //      such as file permissions, executable bit as these are present in
        //      the tar `header`.

        // Pipe the file stream to the PUT request
        stream.pipe(req, {end: false});

        // End PUT request and handle response
        req.end(function(res) {
          // If put result failed
          if (!res.ok) {
            debug("Failed to pipe the artifact file stream to S3");
            resolution = {
              action:     reject,
              retval:     res.text
            };
          } else {
            debug("Artifact successfully uploaded!");
            resolution = {
              action:     accept,
              retval:     null
            };
          }
          // Whatever happened we have to finish tar extraction
          next();
        });
      });

      // Wait for TAR extraction to finish
      extract.on('finish', function() {
        if (resolution) {
          // Make the resolution whatever it was take effect
          resolution.action(resolution.retval);
        } else {
          // Docker 0.9 returns an empty tar stream for missing files
          accept("No content available at '" + path + "' most likely " +
                 "there is nothing at that path.");
        }
      });

      // Pipe the data-stream from docker for tar-extraction
      res.pipe(extract);
    });
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
