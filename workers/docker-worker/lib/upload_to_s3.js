import https from 'https';
import url from 'url';
import fs from 'fs';
import temporary from 'temporary';
import promiseRetry from 'promise-retry';
import _ from 'lodash';

export default async function uploadToS3 (
  task,
  sourceStream,
  artifactName,
  expiration,
  httpsHeaders,
  putUrl,
  httpOptions)
{
  let queue = task.runtime.queue;

  let tmp = new temporary.File();

  try {
    await new Promise((accept, reject) => {
      let stream = fs.createWriteStream(tmp.path);
      stream.on('error', reject);
      stream.on('finish', accept);
      sourceStream.pipe(stream);
    });

    if (!putUrl) {
      var artifact = await queue.createArtifact(
        task.status.taskId,
        task.runId,
        artifactName,
        {
          // Why s3? It's currently cheaper to store data in s3 this could easily
          // be used with azure simply by changing s3 -> azure.
          storageType: 's3',
          expires: new Date(Math.min(expiration, new Date(task.task.expires))),
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
        task.runtime.log('retrying artifact upload', {
          taskId: task.status.taskId,
          runId: task.runId
        });
        task.runtime.log(`Attempt number ${number}`);
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
            accept();
          }
        });

        req.on('error', err => {
          task.runtime.log(`Error uploading ${artifactName}`, {
            taskId: task.status.taskId,
            runId: task.runId
          });
          reject(err);
        });

        req.setTimeout(5 * 60 * 1000, reject);
        task.runtime.log(`Uploading ${artifactName}`, {
          taskId: task.status.taskId,
          runId: task.runId
        });
        fs.createReadStream(tmp.path).pipe(req);
      }).catch(retry);
    // randomize the timeouts
    }, {randomize: true});
  } finally {
    tmp.unlink();
  }
}
