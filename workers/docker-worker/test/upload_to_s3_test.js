const uploadToS3 = require('../src/lib/upload_to_s3');
const assert = require('assert');

suite('upload to s3 test', function () {
  let temporary = require('temporary');
  let fs = require('fs');
  let path = require('path');
  let https = require('https');

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

    let tempFile = new temporary.File();
    let resultFile = new temporary.File();

    let server = https.createServer({
      key: fs.readFileSync(path.join(__dirname, 'fixtures', 'ssl_cert.key')),
      cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'ssl_cert.crt'))
    });

    let requestState = 0;
    server.on('request', function(request, response) {
      let finishRequest = function(status) {
        response.writeHead(status);
        response.end();
      };

      if (request.method != 'PUT') {
        finishRequest(405);
      } else if (!requestState) {
        requestState++;
        finishRequest(501);
      } else {
        requestState++;
        new Promise(function(accept, reject) {
          let resultStream = fs.createWriteStream(resultFile.path);
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
      'content-length': DATA.length
    };

    try {
      await uploadToS3(
        undefined,  // since putUrl is supplied, this is unused
        1,
        0,
        await getTemporaryStream(tempFile.path, DATA),
        'public/foo',
        expiry,
        httpHeader,
        'https://localhost:8000',
        {rejectUnauthorized: false}
      );

      assert.equal(requestState, 2);
      assert.equal(DATA, fs.readFileSync(resultFile.path, 'utf8'));
    } finally {
      tempFile.unlink();
      resultFile.unlink();
    }
  });
});
