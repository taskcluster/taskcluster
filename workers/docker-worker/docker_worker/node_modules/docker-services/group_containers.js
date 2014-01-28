var Associate = require('./associate');
var GroupConfig = require('./group_config');
var Promise = require('promise');
var DockerProc = require('./docker_proc');

var dockerUtils = require('./docker_utils');
var debug = require('debug')('docker-service:group_containers');

/**
Trim down the services returned by inspect services to only those in the allowed
parameter (or just return everything if nothing is in allowed).
*/
function trimServices(inspectResult, allowed) {
  if (!allowed) return inspectResult;

  var results = {};

  allowed.forEach(function(name) {
    if (!inspectResult[name]) return;
    results[name] = inspectResult[name];
  });
}


/**
@param {Dockerode} docker api.
@param {Object} groupConfig for containers.
@param {String} name for container group.
*/
function GroupContainers(docker, groupConfig, name) {
  this.docker = docker;
  this.name = name;

  this.config = new GroupConfig(groupConfig);
  this.associate = new Associate(docker, name);
}

GroupContainers.prototype = {

  /**
  Docker wrapper around stop (mostly here for consistency)
  */
  _stop: function(containerId) {
    debug('stop container', containerId);
    var containerInterface = this.docker.getContainer(containerId);
    return containerInterface.stop();
  },

  /**
  Remove a particular instance of an node (again for consistency)
  */
  _remove: function(containerId) {
    debug('remove container', containerId);
    var containerInterface = this.docker.getContainer(containerId);
    return containerInterface.kill().then(
      function stopped() {
        return containerInterface.remove();
      }.bind(this)
    );
  },

  /**
  Start a created container and link it.

  @param {Object} name associated with the service.
  @param {String} containerId docker container id.
  @param {Object} links current link mapping.
  */
  _start: function(name, containerId, links) {
    debug('start container', name, containerId);

    var startConfig = this.config.dockerStartConfig(name, links);
    return this.docker.getContainer(containerId).start(startConfig);
  },

  /**
  Start running a service as deamon background process.

  @param {String} name of the service.
  @param {Object} links map of available links.
  */
  _deamonize: function(name, links) {
    var docker = this.docker;

    debug('deamonize', name);
    var createConfig = this.config.dockerCreateConfig(name);

    var containerInterface;
    var id;

    // ensure that the image is downloaded
    return dockerUtils.ensureImage(docker, createConfig.Image).then(
      function() {
        return docker.createContainer(createConfig);
      }
    ).then(
      function onCreate(container) {
        id = container.id;
        containerInterface = docker.getContainer(id);

        // add the container before we start
        return this.associate.addContainer(id, name);
      }.bind(this)
    ).then(
      function() {
        return this._start(name, id, links);
      }.bind(this)
    ).then(
      function() {
        return id;
      }
    );
  },

  _launchGroupThunk: function(links, state, services) {
    // lazily evaluated (for promise chains)
    return function() {
      var promises = [];
      var docker = this.docker;

      services.forEach(function(service) {
        var name = service.name;
        // check to see if we have one running already
        var serviceState = state[name];

        if (serviceState && serviceState[0]) {
          var instance = serviceState[0];
          links[name] = instance.name;

          if (!instance.running) {
            // XXX: maybe this should throw as a link can be associated
            // with a down service and restarting might be a better idea.
            promises.push(this._start(name, instance.id, links));
          }

          // its running or we started it so move to the next item.
          return;
        }

        var promise = this._deamonize(name, links).then(
          function gotContainer(id) {
            return docker.getContainer(id).inspect();
          }
        ).then(
          function saveLink(result) {
            links[name] = result.Name;
          }
        );

        promises.push(promise);
      }, this);

      return Promise.all(promises);

    }.bind(this);
  },

  _startDependencyGroups: function(dependencies) {
    if (!dependencies.length) return Promise.from(false);

    var links = {};

    // get the current state of the system.
    return this.inspectServices().then(
      function servicesRunning(state) {
        startingState = state;

        var group;
        var chain;
        var depth = 0;
        while ((group = dependencies.shift())) {
          depth++;
          var thunk = this._launchGroupThunk(links, state, group);
          if (!chain) {
            chain = thunk();
            continue;
          }
          chain = chain.then(thunk);
        }
        return chain;
      }.bind(this)
    ).then(
      function() { return links; }
    );
  },

  /**
  Launch services and their dependencies.

  @param {Array} [services] optional list of services to launch.
  @return {Promise}
  */
  startServices: function(services) {
    debug('up');
    var deps = this.config.dependencyGroups(services);
    return this._startDependencyGroups(deps);
  },

  /**
  Invoke a method on all services which have containers.
  */
  _invokeContainerMethod: function(method) {
    var actioned = [];
    return this.inspectServices().then(
      function onCurrentServices(currentServices) {
        var promises = [];

        for (var name in currentServices) {
          currentServices[name].forEach(function(service) {
            var promise = method(service);
            if (promise) {
              actioned.push(service);
              promises.push(promise);
            }
          }, this);
        }
        return Promise.all(promises);
      }.bind(this)
    ).then(
      function() { return actioned; }
    );
  },

  /**
  Return off services and their dependencies.

  XXX: this should allow selective grouping of services.

  @return {Promise}
  */
  stopServices: function() {
    debug('stopServices');
    return this._invokeContainerMethod(function(service) {
      if (service.running) {
        return this._stop(service.id);
      }
    }.bind(this));
  },

  /**
  Remove services and their dependencies.

  XXX: This should allow selective grouping of services.

  @return {Promise}
  */
  removeServices: function() {
    debug('removeServices');
    return this._invokeContainerMethod(function(service) {
      return this._remove(service.id);
    }.bind(this));
  },

  /**
  Start all the dependencies of a given service.
  */
  startDependenciesFor: function(name) {
    var deps = this.config.dependencyGroups([name]);

    // remove the root node
    deps.pop();

    return this._startDependencyGroups(deps);
  },

  /**
  Resolve all dependencies for a given service (bring them up) and resolve with
  a DockerProc value which can be used to run the service and get its
  stdout/stderr.

  @return {Promise}
  */
  spawn: function(name, cmd, options) {
    debug('spawn', name, cmd);

    var overrides;
    if (cmd) {
      overrides = { Cmd: cmd };
    }

    var createConfig = this.config.dockerCreateConfig(name, overrides);

    return this.startDependenciesFor(name).then(
      function(links) {
        var startConfig = this.config.dockerStartConfig(name, links);

        return new DockerProc(this.docker, {
          start: startConfig,
          create: createConfig
        });
      }.bind(this)
    );
  },

  /**
  Run a status check on all services in this group.

    // value looks like this
    {
      worker: [{ name: '/docker_name', id: 'woot', running: true }],
     ...
    }

  @return {Promise}
  */
  inspectServices: function() {
    var docker = this.docker;
    var associate = this.associate;
    var result;

    function mapServiceToContainer(list) {
      return list.map(function(serviceNode) {
        var container = docker.getContainer(serviceNode.id);
        return container.inspect().then(
          function available(result) {
            serviceNode.running = result.State.Running;
            serviceNode.name = result.Name;
            // docker uses id, Id AND ID
            serviceNode.id = result.ID;
            serviceNode.inspection = result;
          },
          function missingContainer(err) {
            if (err.message.indexOf('404') === -1) throw err;
            debug(
              'removing missing service node',
              serviceNode.service,
              serviceNode.id
            );

            // remove the service from the in memory list
            var idx = list.indexOf(serviceNode);
            if (idx !== -1) {
              list.splice(idx, 1);

              // remove the whole service if it has zero nodes
              if (!result[serviceNode.service].length) {
                delete result[serviceNode.service];
              }
            }

            // also remove it from the associate
            return associate.removeContainer(serviceNode.id);
          }.bind(this)
        );
      });
    }

    return this.associate.getServices().then(
      function services(services) {
        result = services;

        var promises = [];
        for (var key in result) {
          promises = promises.concat(mapServiceToContainer(result[key]));
        }

        return Promise.all(promises).then(
          function() {
            return result;
          }
        );
      }
    );
  }
};

module.exports = GroupContainers;
