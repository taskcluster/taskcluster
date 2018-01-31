const Debug = require('debug');
const crypto = require('crypto');
const https = require('https');
const url = require('url');
const fs = require('mz/fs');
const temporary = require('temporary');
const promiseRetry = require('promise-retry');
const { createLogger } = require('./log');
const _ = require('lodash');
const waitForEvent = require('./wait_for_event');

var log = createLogger({source: 'uploadToS3'});
let debug = Debug('taskcluster-docker-worker:uploadToS3');

// Upload an S3 artifact to the queue for the given taskId/runId.  Source can be
// a string or a stream.
module.exports = async function uploadToS3 (
  queue,
  taskId,
  runId,
  source,
  artifactName,
  expiration,
  httpsHeaders,
  putUrl,
  httpOptions)
{
  let tmp = new temporary.File();
  debug(`created temporary file $${tmp.path} for ${artifactName}`);

  let logDetails = {taskId, runId, artifactName};
  let digest;
  let size;

  try {
    // write the source out to a temporary file so that it can be
    // re-read into the request repeatedly
    if (typeof source === 'string') {
      await tmp.writeFile(source);
    } else {
      await new Promise((accept, reject) => {
        let stream = fs.createWriteStream(tmp.path);
        stream.on('error', reject);
        stream.on('finish', accept);
        source.pipe(stream);
      });
    }
    debug(`wrote source file to ${tmp.path} for ${artifactName}`);

    let stat = await fs.stat(tmp.path);
    size = stat.size;

    // Can this be done at the same time as piping to the write stream?
    let hash = crypto.createHash('sha256');
    let input = fs.createReadStream(tmp.path);
    input.on('readable', () => {
      let data = input.read();
      if (data) {
        hash.update(data);
      }
    });

    await waitForEvent(input, 'end');

    if (!putUrl) {
      var artifact = await queue.createArtifact(
        taskId,
        runId,
        artifactName,
        {
          // Why s3? It's currently cheaper to store data in s3 this could easily
          // be used with azure simply by changing s3 -> azure.
          storageType: 's3',
          expires: new Date(expiration),
          contentType: httpsHeaders['content-type']
        }
      );

      putUrl = artifact.putUrl;
    }

    var parsedUrl = url.parse(putUrl);
    var options = _.defaults({
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'PUT',
      headers: httpsHeaders,
      port: parsedUrl.port
    }, httpOptions);

    // promiseRetry defaults to 10 attempts before failing
    await promiseRetry((retry, number) => {
      if (number > 1) { // if it's not the first attempt
        log('retrying artifact upload', _.defaults({}, logDetails, {
          attemptNumber: number
        }));
      }

      return new Promise((accept, reject) => {
        let req = https.request(options);

        req.on('response', (response) => {
          // Flush the data from the reponse so it's not held in memory
          response.resume();

          if (response.statusCode !== 200) {
            reject(new Error(
              `Could not upload artifact. Status Code: ${response.statusCode}`
            ));
          } else {
            digest = hash.digest('hex');
            logDetails.hash = digest;
            accept();
          }
        });

        req.on('error', err => {
          log(`Error uploading ${artifactName}`, logDetails);
          reject(err);
        });

        req.setTimeout(5 * 60 * 1000, reject);
        log(`Uploading ${artifactName}`, logDetails);
        fs.createReadStream(tmp.path).pipe(req);
      }).catch(retry);
    // randomize the timeouts
    }, {randomize: true});
  } finally {
    tmp.unlinkSync();
  }

  return {digest, size};
};
