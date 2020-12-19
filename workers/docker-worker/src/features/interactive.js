const Debug = require('debug');
const { DockerExecServer } = require('docker-exec-websocket-server');
const fs = require('mz/fs');
const http = require('http');
const https = require('https');
const path = require('path');
const slugid = require('slugid');
const SharedFileLock = require('../shared_file_lock');
const url = require('url');
const libUrls = require('taskcluster-lib-urls');
const queryString = require('query-string');
const util = require('util');

const readFile = util.promisify(fs.readFile);

let debug = Debug('docker-worker:features:interactive');

//Number of attempts to find a port before giving up
const MAX_RANDOM_PORT_ATTEMPTS = 20;

class WebsocketServer {
  constructor () {
    this.featureName = 'dockerInteractive';
    this.path = '/' + slugid.v4() + '/shell.sock';
    this.lock = path.join('/tmp/', slugid.v4() + '.lock');
  }

  async link(task) {
    //touches the lockfile so it can be bound properly
    this.semaphore = new SharedFileLock(await fs.open(this.lock, 'w'));

    // Ensure sockets folder is created

    return {
      binds: [{
        source: path.join(__dirname, '../../bin-utils'),
        target: '/.taskclusterutils',
        readOnly: true,
      }, {
        source: this.lock,
        target: '/.taskclusterinteractivesession.lock',
        readOnly: false,
      }],
    };
  }

  async createHttpServer(task) {
    debug('creating ws server');
    let httpServ;
    if (task.runtime.interactive.ssl) {
      let [key, cert] = await Promise.all([
        readFile(task.runtime.ssl.key),
        readFile(task.runtime.ssl.certificate),
      ]);
      httpServ = https.createServer({ key, cert });
    } else {
      httpServ = http.createServer();
    }
    debug('server made');

    let port;
    //searching for an open port between 32768 and 61000
    let attempts = 0;
    for (;;) {
      port = Math.floor((Math.random() * (61000 - 32768)) + 32768);
      try {
        await new Promise((resolve, reject) => {
          let listeningHandler = () => {
            httpServ.removeListener('error', errorHandler);
            resolve();
          };
          let errorHandler = (err) => {
            httpServ.removeListener('listening', listeningHandler);
            reject(err);
          };
          httpServ.once('listening', listeningHandler);
          httpServ.once('error', errorHandler);
          httpServ.listen(port);
        });
        debug('%s chosen as port', port);
        break;
      } catch (err) {
        // Only handle address in use errors.
        if (err.code !== 'EADDRINUSE') {
          throw err;
        }
        attempts += 1;
        if (attempts >= MAX_RANDOM_PORT_ATTEMPTS) {
          throw err;
        }
      }
    }

    return { httpServ, port };
  }

  async started(task) {
    this.ssh = await this.createHttpServer(task);

    // Create the websocket server
    this.shellServer = new DockerExecServer({
      server: this.ssh.httpServ,
      containerId: task.dockerProcess.id,
      path: this.path,
    });

    //and its corresponding url
    let shellSocketUrl = url.format({
      protocol: task.runtime.interactive.ssl ? 'wss' : 'ws',
      slashes: true,
      hostname: task.hostname,
      port: this.ssh.port,
      pathname: this.path,
    });

    //set expiration stuff
    this.semaphore.acquire();
    this.semaphore.release(task.runtime.interactive.minTime * 1000);
    this.shellServer.on('session added', () => {
      this.semaphore.acquire();
    });
    this.shellServer.on('session removed', () => {
      let delay = task.runtime.interactive.expirationAfterSession * 1000;
      this.semaphore.release(delay);
    });

    task.runtime.log('create websocket server at ', { shellSocketUrl });

    let expiration = new Date(
      Math.min(Date.now() + task.task.payload.maxRunTime,
        new Date(task.task.expires)));
    let queue = task.queue;

    debug('making artifacts');
    await queue.createArtifact(
      task.status.taskId,
      task.runId,
      path.join(task.runtime.interactive.artifactName, 'shell.html'), {
        storageType: 'reference',
        expires: expiration.toJSON(),
        contentType: 'text/html',
        url: libUrls.ui(task.runtime.rootUrl, '/shell/?' +
          queryString.stringify({
            v: '1',
            socketUrl: shellSocketUrl,
            taskId: task.status.taskId,
            runId: task.runId,
          })),
      },
    );
    debug('artifacts made');
  }

  async killed (task) {
    if (this.ssh && this.ssh.httpServ) {
      this.ssh.httpServ.close();
    }
    if(this.shellServer) {
      this.shellServer.close();
    }
    try {
      //delete the lockfile, allowing the task to die if it hasn't already
      await fs.unlink(this.lock);
    } catch (err) {
      task.runtime.log('[alert-operator] lock file has disappeared!');
      debug(err);
    }
  }
}

module.exports = WebsocketServer;
