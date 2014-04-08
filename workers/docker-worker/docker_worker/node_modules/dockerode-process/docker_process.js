var EventEmitter = require('events').EventEmitter;
var streams = require('stream');
var debug = require('debug')('docker-process');
var utils = require('./utils');
var Promise = require('promise');

function connectStreams(dockerProc, container, stream) {
  // if its a tty stream then pipe the stream directly into stdout
  if (dockerProc._createConfig.Tty) {
    // http://docs.docker.io/en/latest/api/docker_remote_api_v1.8/#attach-to-a-container
    stream.pipe(dockerProc.stdout);
    return;
  }

  // attach the streams to out std(out|err) streams.
  container.modem.demuxStream(
    stream,
    dockerProc.stdout,
    dockerProc.stderr
  );
}

/**
Loosely modeled on node's own child_process object thought the interface to get
the child process is different.
*/
function DockerProc(docker, config) {
  EventEmitter.call(this);

  this.docker = docker;
  this._createConfig = config.create;
  this._startConfig = config.start;

  this.stdout = new streams.PassThrough();
  this.stderr = new streams.PassThrough();
}

DockerProc.prototype = {
  __proto__: EventEmitter.prototype,

  /**
  stdout stream from the docker node.
  */
  stdout: null,

  /**
  stderr stream from the docker node
  */
  stderr: null,

  /**
  exitCode (may be null!)
  */
  exitCode: null,

  /**
  Remove the docker container.
  */
  remove: function() {
    if (!this.container) {
      return Promise.from(null);
    }
    return this.container.remove();
  },

  _run: function() {
    debug('run', this._createConfig, this._startConfig);

    var docker = this.docker;

    var attachConfig = {
      stream: true,
      stdout: true,
      stderr: true
    };

    var create = docker.createContainer(this._createConfig);
    var container;

    return create.then(

      function onContainer(_container) {
        debug('created container', _container.id);
        this.id = _container.id;
        this.container = container = docker.getContainer(_container.id);
        this.emit('container', container);
        return container.attach(attachConfig);
      }.bind(this)

    ).then(

      function attachedContainer(stream) {
        debug('attached');
        connectStreams(this, container, stream);
        return container.start(this._startConfig);
      }.bind(this)

    ).then(

      function startedContainer() {
        this.started = true;
        this.emit('container start', this.container);
        debug('initiate wait for container');
        return container.wait();
      }.bind(this)

    ).then(

      function markExit(result) {
        this.exitCode = result.StatusCode;

        // emit exit so we behave more like a normal child process
        this.emit('exit', this.exitCode);
        // close is the same as exit in this context so emit that now
        this.emit('close', this.exitCode);

        return this.exitCode;
      }.bind(this)

    );
  },

  /**
  Run the docker process and resolve the promise on complete.

  @param {Object} options for running the container.
  @param {Boolean} [options.pull=true] when true pull the image and prepend the
                   download details to stdout.
  */
  run: function(options) {
    options = options || {};
    if (!('pull' in options)) options.pull = true;

    // no pull means no extra stream processing...
    if (!options.pull) return this._run();

    return new Promise(function(accept, reject) {
      // pull the image (or use on in the cache and output status in stdout)
      var pullStream = utils.streamImage(this.docker, this._createConfig.Image);

      // pipe the pull stream into stdout but don't end
      pullStream.pipe(this.stdout, { end: false });

      pullStream.once('error', reject);
      pullStream.once('end', function() {
        pullStream.removeListener('error', reject);
        this._run().then(accept, reject);
      }.bind(this));
    }.bind(this));
  },

  /** Kill docker container */
  kill: function() {
    var that = this;
    this.killed = true;
    if (this.started) {
      this.container.kill();
    } else {
      this.once('container start', function() {
        that.container.kill();
      });
    }
  }
};

module.exports = DockerProc;
