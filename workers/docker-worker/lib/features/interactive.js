import assert from 'assert';
import Debug from 'debug';
import {DockerExecServer} from 'docker-exec-websocket-server';
import fs from 'mz/fs';
import http from 'http';
import https from 'https';
import path from 'path';
import Promise from 'promise';
import slugid from 'slugid';
import SharedFileLock from '../shared_file_lock';
import url from 'url';

let debug = Debug('docker-worker:features:interactive');

//Number of attempts to find a port before giving up
const MAX_RANDOM_PORT_ATTEMPTS = 20;

export default class WebsocketServer {
  constructor () {
    let id = slugid.v4();
    this.path = '/' + id;
    this.lock = path.join('/tmp/', id + '.lock');
  }

  async link(task) {
    //touches the lockfile so it can be bound properly
    this.semaphore = new SharedFileLock(await fs.open(this.lock, 'w'));

    return {
      binds: [{
        source: path.join(__dirname, '../../bin-utils'),
        target: '/.taskclusterutils',
        readOnly: true
      }, {
        source: this.lock,
        target: '/.taskclusterinteractivesession.lock',
        readOnly: false
      }]
    };
  }

  async started(task) {
    debug('creating ws server');
    let httpServ;
    if (task.runtime.interactive.ssl) {
      let [key, cert] = await Promise.all([
        fs.readFile(task.runtime.ssl.key),
        fs.readFile(task.runtime.ssl.certificate)
      ]);
      httpServ = https.createServer({key, cert});
    } else {
      httpServ = http.createServer();
    }
    debug('server made')

    let port;
    //searching for an open port between 32768 and 61000
    let attempts = 0;
    while (true) {
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

    //create the websocket server
    this.server = new DockerExecServer({
      server: httpServ,
      containerId: task.dockerProcess.id,
      path: this.path,
    });

    //and its corresponding url
    let socketUrl = url.format({
      protocol: task.runtime.interactive.ssl ? 'wss' : 'ws',
      slashes: true,
      hostname: task.hostname,
      port: port,
      pathname: this.path,
    });

    //set expiration stuff
    this.semaphore.acquire();
    this.semaphore.release(task.runtime.interactive.maxTime * 1000);
    this.server.on('session added', () => {
      this.semaphore.acquire();
    });
    this.server.on('session removed', () => {
      this.semaphore.release(task.runtime.interactive.expirationAfterSession * 1000);
    });

    task.runtime.log('create websocket server at ', {socketUrl});

    let expiration = new Date(Date.now() + task.task.payload.maxRunTime * 1000);
    let queue = task.runtime.queue;

    let socketArtifact = queue.createArtifact(
      task.status.taskId,
      task.runId,
      path.join(task.runtime.interactive.artifactName, 'interactive.sock'), {
        storageType: 'reference',
        expires: expiration.toJSON(),
        contentType: 'application/octet-stream',
        url: socketUrl
      }
    );

    let toolsArtifact = queue.createArtifact(
      task.status.taskId,
      task.runId,
      path.join(task.runtime.interactive.artifactName, 'interactive.html'), {
        storageType: 'reference',
        expires: expiration.toJSON(),
        contentType: 'text/html',
        url: url.format({
          protocol: 'https',
          host: 'tools.taskcluster.net',
          pathname: '/interactive',
          query: {
            taskId: task.status.taskId,
            runId: task.runId,
            socketUrl: socketUrl,
            v: '1'
          }
        })
      }
    );

    debug('making artifacts');
    await Promise.all([socketArtifact, toolsArtifact]);
    debug('artifacts made');
  }

  async killed (task) {
    if(this.server) {
      this.server.close();
    }
    try {
      //delete the lockfile, allowing the task to die if it hasn't already
      await fs.unlink(this.lock);
    } catch (err) {
      debug('[alert-operator] lock file has disappeared!');
      debug(err);
    }
  }
}
