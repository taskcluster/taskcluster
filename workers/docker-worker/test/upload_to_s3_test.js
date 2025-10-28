const uploadToS3 = require('../src/upload_to_s3');
const assert = require('assert');
const { tmpdir } = require('os');
const { mkdtempSync, rmSync } = require('fs');
const { join, sep } = require('path');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { suiteName } = require('@taskcluster/lib-testing');

suite(suiteName(), function () {
  async function getTemporaryStream(filename, data) {
    let tempStream = fs.createWriteStream(filename);
    await new Promise(function(accept, reject) {
      tempStream.on('error', reject);
      tempStream.on('finish', accept);
      tempStream.end(data);
    });

    return fs.createReadStream(filename);
  }

  test('upload retry', async function () {
    const DATA = 'Testing retry artifact upload';

    const tmpDir = mkdtempSync(`${tmpdir()}${sep}`);
    const tempFileName = 'temp_file';
    const resultFileName = 'result_file';
    const tempFile = join(tmpDir, tempFileName);
    const resultFile = join(tmpDir, resultFileName);

    let server = https.createServer({
      key: fs.readFileSync(path.join(__dirname, 'fixtures', 'ssl_cert.key')),
      cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'ssl_cert.crt')),
    });

    let requestState = 0;
    server.on('request', function(request, response) {
      let finishRequest = function(status) {
        response.writeHead(status);
        response.end();
      };

      if (request.method !== 'PUT') {
        finishRequest(405);
      } else if (!requestState) {
        requestState++;
        finishRequest(501);
      } else {
        requestState++;
        new Promise(function(accept, reject) {
          let resultStream = fs.createWriteStream(resultFile);
          resultStream.on('error', reject);
          resultStream.on('finish', accept);
          request.pipe(resultStream);
        }).then(function() {
          finishRequest(200);
        }).catch(err => {
          console.error(err);
          finishRequest(500);
        });
      }
    });

    await new Promise(function(accept, reject) {
      server.on('listening', accept);
      server.on('error', reject);
      server.listen(8000);
    });

    let expiry = new Date();
    expiry.setDate(expiry.getDate() + 1);

    let httpHeader = {
    };

    try {
      await uploadToS3(
        undefined, // since putUrl is supplied, this is unused
        1,
        0,
        await getTemporaryStream(tempFile, DATA),
        'public/foo',
        expiry,
        httpHeader,
        'https://localhost:8000',
        { rejectUnauthorized: false },
      );

      assert.equal(requestState, 2);
      assert.equal(DATA, fs.readFileSync(resultFile, 'utf8'));
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});
