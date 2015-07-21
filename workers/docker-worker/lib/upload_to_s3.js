import https from 'https';
import url from 'url';

export default async function uploadToS3 (task, sourceStream, artifactName, expiration, httpsHeaders) {
  var queue = task.runtime.queue;

  var artifact = await queue.createArtifact(
    task.status.taskId,
    task.runId,
    artifactName,
    {
      // Why s3? It's currently cheaper to store data in s3 this could easily
      // be used with azure simply by changing s3 -> azure.
      storageType: 's3',
      expires: expiration.toJSON(),
      contentType: httpsHeaders['content-type']
    }
  );

  let parsedUrl = url.parse(artifact.putUrl);
  let options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.path,
    method: 'PUT',
    headers: httpsHeaders
  };

  let req = https.request(options);
  sourceStream.pipe(req);

  let response = await new Promise((accept, reject) => {
    req.on('response', (res) => { accept(res); });
    req.on('error', (err) => { reject(new Error(`Could not upload artifact. ${err}`)); });
  });

  // Flush the data from the reponse so it's not held in memory
  response.resume();

  if (response.statusCode !== 200) {
    throw new Error(
      `Could not upload artifact. ${response.error} Status Code: ${response.statusCode}`
    );
  }
}
