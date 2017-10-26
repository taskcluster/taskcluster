const assert = require('assert');
const Debug = require('debug');
const {DockerExecServer} = require('docker-exec-websocket-server');
const fs = require('mz/fs');
const http = require('http');
const https = require('https');
const path = require('path');
const slugid = require('slugid');
const SharedFileLock = require('../shared_file_lock');
const url = require('url');
const wsStream = require('websocket-stream');
const ws = require('ws');
const devnull = require('dev-null');
const streams = require('memory-streams');
const waitForSocket = require('../wait_for_socket');
const net = require('net');
const rmrf = require('rimraf');
const express = require('express');

let debug = Debug('docker-worker:features:interactive');

//Number of attempts to find a port before giving up
const MAX_RANDOM_PORT_ATTEMPTS = 20;

/** Let displays of a container that /.taskclusterutils is mounted inside */
let listDisplays = async (container) => {
  debug('Listing displays');
  // Run list-displays
  let exec = await container.exec({
    AttachStdout: true,
    AttachStderr: false,
    AttachStdin: false,
    Tty: false,
    Cmd: ['/.taskclusterutils/list-displays']
  });
  let stream = await exec.start({
    Detach: false,
    stdin:  false,
    stdout: true,
    stderr: false,
    stream: true
  });

  // Capture output
  let stdout = new streams.WritableStream();
  exec.modem.demuxStream(stream, stdout, devnull());

  // Wait for termination
  await new Promise((accept, reject) => {
    stream.on('error', reject);
    stream.on('end', accept);
  });

  stdout = stdout.toString();
  debug("output: %s", stdout);

  // Split results into some nice JSON
  return stdout.trim('\n').split('\n').filter(line => {
    return line !== '';
  }).map(line => {
    let data = /^(.+)\t(\d+)x(\d+)$/.exec(line);
    if (!data) {
      throw new Error("Unexpected response line: " + line);
    }
    return {
      display:  data[1],
      width:    parseInt(data[2]),
      height:   parseInt(data[3])
    };
  });
};

/**
 * Open VNC connection inside a container for display using mounted
 * socketFolder, and additional x11vnc arguments.
 */
let OpenDisplay = async (container, display, socketFolder, argv = [], name) => {
  // Create a socket filename
  let socketName = slugid.nice() + '.sock';

  // Start x11vnc, it'll shutdown if no connection is made in 120s or if a
  // client connects and then disconnects. This way x11vnc is only running when
  // someone is connected to it, and doesn't otherwise incur overhead.
  let exec = await container.exec({
    AttachStdout: false,
    AttachStderr: false,
    AttachStdin: false,
    Tty: false,
    Cmd: [
      '/.taskclusterutils/x11vnc',
      '-display', display,
      '-timeout', '120',
      '-nopw', '-norc',
      '-desktop', name,
      '-unixsockonly', '/.taskclusterinteractiveexport/' + socketName
    ].concat(argv)
  });
  await exec.start({
    Detach: true,
    stdin:  false,
    stdout: false,
    stderr: false,
    stream: true
  });

  // Filename of the socket on our side
  let socketFile = path.join(socketFolder, socketName);

  // Wait for VNC socket to show up
  await waitForSocket(socketFile, 30 * 1000);

  // Create connection to VNC socket and return it
  return net.createConnection(socketFile);
};


class WebsocketServer {
  constructor () {
    this.featureName = 'dockerInteractive';
    this.path = '/' + slugid.v4() + '/shell.sock';
    this.lock = path.join('/tmp/', slugid.v4() + '.lock');
    this.socketsFolder = path.join('/tmp/', slugid.v4());
    this.vncPath = '/' + slugid.v4() + '/display.sock';
  }

  async link(task) {
    //touches the lockfile so it can be bound properly
    this.semaphore = new SharedFileLock(await fs.open(this.lock, 'w'));

    // Ensure sockets folder is created
    await fs.mkdir(this.socketsFolder);

    return {
      binds: [{
        source: path.join(__dirname, '../../../bin-utils'),
        target: '/.taskclusterutils',
        readOnly: true
      }, {
        source: this.lock,
        target: '/.taskclusterinteractivesession.lock',
        readOnly: false
      }, {
        source: this.socketsFolder,
        target: '/.taskclusterinteractiveexport',
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

    // Remember the http server
    this.httpServer = httpServ;

    // Create a simple app to serve listDisplays
    let app = express();
    // Allow all CORS requests
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', [
        'OPTIONS',
        'GET',
        'HEAD',
        'POST',
        'PUT',
        'DELETE',
        'TRACE',
        'CONNECT'
      ].join(','));
      res.header('Access-Control-Request-Method', '*');
      res.header('Access-Control-Allow-Headers',  [
        'X-Requested-With',
        'Content-Type',
        'Authorization',
        'Accept',
        'Origin'
      ].join(','));
      next();
    });
    // List displays if a get request arrives against the socket
    app.get(this.vncPath, async (req, res) => {
      try {
        let displays = await listDisplays(task.dockerProcess.container);
        res.status(200).json(displays);
      } catch (err) {
        debug('Failed to list displays: %j', err, err.stack);
        res.status(500).json({message: "internal error"});
      }
    });
    // Make app handle requests
    httpServ.on('request', app);

    // Create display lookup url
    let listDisplayUrl = url.format({
      protocol: task.runtime.interactive.ssl ? 'https' : 'http',
      slashes: true,
      hostname: task.hostname,
      port: port,
      pathname: this.vncPath,
    });

    // Create websockify display server
    this.displayServer = ws.createServer({
      server: httpServ,
      path:   this.vncPath,
    }, async (client) => {
      try {
        // Parse query string
        let query = url.parse(client.upgradeReq.url, true).query || {};
        if (!query.display) {
          debug('Abort VNC session missing query.display');
          return client.close();
        }
        let argv = query.arg || [];
        if (!(argv instanceof Array)) {
          argv = [argv];
        }

        let name = query.display + ' on taskId: ' + task.status.taskId +
                   ' runId: ' + task.runId;
        let stream = wsStream(client);
        let socket = await OpenDisplay(
          task.dockerProcess.container,
          query.display,
          this.socketsFolder,
          argv,
          name
        );
        stream.pipe(socket);
        socket.pipe(stream);

        // Track the client life-cycle
        this.semaphore.acquire();
        stream.once('end', () => {
          let delay = task.runtime.interactive.expirationAfterSession * 1000;
          this.semaphore.release(delay);
        });
      } catch (err) {
        client.close();
        debug('Error opening VNC session: %j', err, err.stack);
      }
    });

    // Create display socket url
    let displaySocketUrl = url.format({
      protocol: task.runtime.interactive.ssl ? 'wss' : 'ws',
      slashes: true,
      hostname: task.hostname,
      port: port,
      pathname: this.vncPath,
    });

    // Create the websocket server
    this.shellServer = new DockerExecServer({
      server: httpServ,
      containerId: task.dockerProcess.id,
      path: this.path,
    });

    //and its corresponding url
    let shellSocketUrl = url.format({
      protocol: task.runtime.interactive.ssl ? 'wss' : 'ws',
      slashes: true,
      hostname: task.hostname,
      port: port,
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

    task.runtime.log('create websocket server at ', {shellSocketUrl});

    let expiration = new Date(
      Math.min(Date.now() + task.task.payload.maxRunTime,
      new Date(task.task.expires)));
    let queue = task.queue;

    let toolsShellArtifact = queue.createArtifact(
      task.status.taskId,
      task.runId,
      path.join(task.runtime.interactive.artifactName, 'shell.html'), {
        storageType: 'reference',
        expires: expiration.toJSON(),
        contentType: 'text/html',
        url: url.format({
          protocol: 'https',
          host: 'tools.taskcluster.net',
          pathname: '/shell/',
          query: {
            v: '1',
            socketUrl: shellSocketUrl,
            taskId: task.status.taskId,
            runId: task.runId,
          },
        })
      }
    );
    let toolsDisplayArtifact = queue.createArtifact(
      task.status.taskId,
      task.runId,
      path.join(task.runtime.interactive.artifactName, 'display.html'), {
        storageType: 'reference',
        expires: expiration.toJSON(),
        contentType: 'text/html',
        url: url.format({
          protocol: 'https',
          host: 'tools.taskcluster.net',
          pathname: '/display/',
          query: {
            v: '1',
            socketUrl: displaySocketUrl,
            displaysUrl: listDisplayUrl,
            taskId: task.status.taskId,
            runId: task.runId,
          },
        })
      }
    );

    debug('making artifacts');
    await Promise.all([
      toolsShellArtifact,
      toolsDisplayArtifact,
    ]);
    debug('artifacts made');
  }

  async killed (task) {
    if (this.httpServer) {
      this.httpServer.close();
    }
    if(this.shellServer) {
      this.shellServer.close();
    }
    if(this.displayServer) {
      this.displayServer.close();
    }
    try {
      //delete the lockfile, allowing the task to die if it hasn't already
      await fs.unlink(this.lock);
    } catch (err) {
      task.runtime.log('[alert-operator] lock file has disappeared!');
      debug(err);
    }
    // Remove the sockets folder, we don't need it anymore...
    rmrf(this.socketsFolder, err => {
      // Errors here are not great
      if (err) {
        debug("Failed to remove tmpFolder: %s", err.stack);
      }
    });
  }
}

module.exports = WebsocketServer;
