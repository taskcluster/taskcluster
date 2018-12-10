import { createServer } from 'http';
import assert from 'assert';
import fetch from '../src/utils/fetch';

describe('fetch', () => {
  let server;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
  });

  it('should retry a 500', () => {
    let attemptCount = 0;

    server = createServer((req, res) => {
      attemptCount += 1;

      if (attemptCount < 2) {
        res.writeHead(500);
        res.end();
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true }));
      }
    });

    return new Promise((resolve, reject) => {
      server.listen(async () => {
        const { port } = server.address();

        try {
          const response = await fetch(`http://127.0.0.1:${port}`);

          assert.equal(response.success, true);

          resolve();
        } catch (err) {
          reject(err);
        }
      });
      server.on('error', reject);
    });
  });

  it('should throw a 400', () => {
    server = createServer((req, res) => {
      res.writeHead(400);
      res.end();
    });

    return new Promise((resolve, reject) => {
      server.listen(async () => {
        const { port } = server.address();

        try {
          await fetch(`http://127.0.0.1:${port}`);

          resolve();
        } catch (err) {
          assert.equal(err.response.status, 400);

          resolve(err);
        }
      });
      server.on('error', reject);
    });
  });

  it('should fail after max retries', () => {
    server = createServer((req, res) => {
      res.writeHead(500);
      res.end();
    });

    return new Promise((resolve, reject) => {
      server.listen(async () => {
        const { port } = server.address();

        try {
          await fetch(`http://127.0.0.1:${port}`);

          reject();
        } catch (err) {
          assert.equal(err.response.status, 500);

          resolve(err);
        }
      });
      server.on('error', reject);
    });
  });
});
