var EventEmitter = require('events').EventEmitter;
var streams = require('stream');
var debug = require('debug')('docker-services:exec');

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
  Run the docker process and resolve the promise on complete.
  */
  exec: function() {
    debug('exec', this._createConfig, this._startConfig);

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
        container = docker.getContainer(_container.id);
        return container.attach(attachConfig);
      }.bind(this)
    ).then(
      function attachedContainer(stream) {
        debug('attached');

        // attach the streams to out std(out|err) streams.
        container.modem.demuxStream(
          stream,
          this.stdout,
          this.stderr
        );

        var start = container.start(this._startConfig);
        return start;
      }.bind(this)
    ).then(
      function startedContainer() {
        debug('initiate wait for container');
        return container.wait();
      }
    ).then(
      function markExit(result) {
        this.exitCode = result.StatusCode;

        // emit exit so we behave more like a normal child process
        this.emit('exit', this.exitCode);
        // close is the same as exit in this context so emit that now
        this.emit('close', this.exitCode);
      }.bind(this)
    );
  }
};

module.exports = DockerProc;
