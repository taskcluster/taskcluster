/**
Docker does not have any built in container grouping (but we can name
containers).  Since we want the ability to run many different "groups"
of containers that are linked we need some method of defining those
groups and persisting that information somewhere. The persisting is done
on a docker container that holds the details of a particular group. This
file manages those "associate" dockers which contain the details of the
groups.
*/

var IMAGE = 'lightsofapollo/docker-service-associate:0.2.0';

var Promise = require('promise');
var dockerUtils = require('./docker_utils');
var request = require('./request');

/**
Lock a method to ensure only one instance of the method is running at
once.

XXX: this could also be implemented with a weakmap in ES6
     (then we could avoid using name) and just use the context.
*/
function methodMutex(name, method) {
  return function() {
    var args = Array.prototype.slice.call(arguments);

    // now that we have a value for the method replace it with a method
    // which will return the promise but won't re-execute the method.
    var promise = method.apply(this, args);

    // current method that is running
    var previousMethod = this[name];

    // swap out the method for one that returns the promise.
    this[name] = function promiseCache() { return promise };

    // restore the previousMethod once the promise is resolved
    var restore = function restore() {
      this[name] = previousMethod;
    }.bind(this);

    // logic to restore the previous method
    promise.then(restore, restore);

    // finally return the promise to the first consumer
    return promise;
  };
}

/**
Method decorator which will ensure the associate is up and the apiUrl is
available.
*/
function ensureApiUrl(method) {
  return ensureUp(function() {
    var args = Array.prototype.slice.call(arguments);
    var context = this;

    return this.apiUrl().then(function(url) {
      args.unshift(url);
      return method.apply(context, args);
    });
  });
}

/**
Method decorator which will call up then call the given method if up is
successful. Method given must return a promise.
*/
function ensureUp(method) {
  return function autoUp() {
    var args = Array.prototype.slice.call(arguments);
    var context = this;
    return this.up().then(
      function handleUp() {
        return method.apply(context, args);
      }
    );
  }
}

/**
The associate is a named docker container that acts "grouping" mechanism for
other containers. With the associate we can lookup which containers belong to
what groups and services.

@param {Docker} docker interface.
@param {String} name docker name for the associate
*/
function Associate(docker, name, options) {
  options = options || {};

  this.name = name;
  this.docker = docker;
}

Associate.prototype = {
  /**
  The associate image name.
  */
  image: IMAGE,

  /**
  Ensure the associate image has been downloaded.

  @return Promise (will resolve as true if already installed).
  */
  _install: function() {
    return dockerUtils.ensureImage(this.docker, IMAGE);
  },

  /**
  Determine the api URL for the associate.
  */
  apiUrl: ensureUp(function() {
    var container = this.docker.getContainer(this.name);
    var promise = container.inspect().then(
      function handleInspect(result) {
        var hostConfig = result.HostConfig;
        var ports = hostConfig.PortBindings['60044/tcp'][0];
        return 'http://' + ports.HostIp + ':' + ports.HostPort;
      }
    );

    // cache api url response
    this.apiUrl = function() { return promise };

    return promise;
  }),

  /**
  Resolves with the container id if its up.
  */
  isUp: function() {
    return this.docker.getContainer(this.name).inspect().then(
      function onContainer(container) {
        return container.State.Running;
      },
      function containerReject(err) {
        // XXX: in reality we should check the error code
        return false;
      }
    );
  },

  /**
  Start and name a docker associate container.
  */
  _start: function() {
    var createConfig = {
      name: this.name,
      Image: IMAGE,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      ExposedPorts: {
        '60044/tcp': {}
      }
    };

    var startConfig = {
      LxcConf: [],
      Privileged: false,
      PortBindings: {
        // find a new open port to bind to
        '60044/tcp': [{ HostIp: '', HostPort: '' }]
      },
      PublishAllPorts: false
    };

    // create the container
    var docker = this.docker;

    return docker.createContainer(createConfig).then(
      function containerCreated(_container) {
        container = docker.getContainer(_container.id);
        return container.start(startConfig);
      }
    );
  },

  /**
  Bring the associate up (if its not already online)
  */
  up: methodMutex('up', function() {
    // there may only be one `up` call running at once
    var promise = this.isUp().then(
      function isUpResult(container) {
        // if its running return the container
        if (container) {
          return container;
        }

        // otherwise start a new container
        return this._install().then(this._start.bind(this));
      }.bind(this)
    );

    return promise;
  }),

  /**
  Turn the associate off if its not already off.
  */
  down: methodMutex('down', function() {
    return this.isUp().then(
      function(isUp) {
        if (!isUp) return false;
        return this.docker.getContainer(this.name).stop();
      }.bind(this)
    );
  }),

  /**
  Remove the container.
  */
  delete: methodMutex('delete', function() {
    var container = this.docker.getContainer(this.name);

    var existingContainer = function existingContainer() {
      return this.down().then(
        function removeContainer() {
          return container.remove();
        }
      );
    }.bind(this);

    return container.inspect().then(
      existingContainer,
      function missing() {
        return false;
      }
    );
  }),

  /**
  Add a container to the association.

  @param {String} id of container.
  @param {String} service name.
  @return Promise
  */
  addContainer: ensureApiUrl(function(url, id, service) {
    var json = [{ id: id, service: service }];

    return request('POST', url + '/containers').send(json).end().then(
      function handleResponse(res) {
        if (res.statusCode !== 200) {
          throw new Error('failed to add container');
        }
        return res.body;
      }
    );
  }),

  /**
  Remove a container from the association.

  @param {String} id of container.
  @return Promise
  */
  removeContainer: ensureApiUrl(function(url, id) {
    var json = [id];

    return request('DELETE', url + '/containers').send(json).end().then(
      function handleResponse(res) {
        if (res.statusCode !== 200) {
          throw new Error('failed to delete container(s)');
        }
        return res.body;
      }
    );
  }),

  /**
  Get all services in the association.

  @return Promise
  */
  getServices: ensureApiUrl(function(url) {
    return request('GET', url + '/services').end().then(
      function handleResponse(res) {
        if (res.statusCode !== 200) {
          throw new Error('failed to fetch services');
        }
        return res.body;
      }
    );
  })
};

module.exports = Associate;
