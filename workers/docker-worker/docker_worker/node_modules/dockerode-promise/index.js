var Promise = require('promise'),
    Docker = require('dockerode');

var wrappedProto = Docker.prototype;

function proxyPromise (method) {
  var promisey = Promise.denodeify(method);
  return function() {
    return promisey.apply(this.$subject, arguments);
  };
}

function promiseObj(target, input) {
  for (var key in input) {
    if (typeof input[key] !== 'function') continue;
    target[key] = proxyPromise(input[key]);
  }
  return target;
}

function PromiseProxy(subject) {
  var result = Object.create(subject);
  result.$subject = subject;
  return promiseObj(result, subject);
}

function DockerProxy(options) {
  this.$subject = new Docker(options);
}

promiseObj(DockerProxy.prototype, wrappedProto);

// sadly we need to wrap run directly as a promise to consolidate both 
// of the resulting arguments.
DockerProxy.prototype.run = function(image, command, stream) {
  var subject = this.$subject;
  return new Promise(function(accept, reject) {
     subject.run(image, command, stream, function(err, result, container) {
        if (err) return reject(err);
        accept({
          result: result,
          // re-wrap
          container: PromiseProxy(container)
        });
     });
  });
};

DockerProxy.prototype.getImage = function (id) {
  return PromiseProxy(this.$subject.getImage(id));
};

DockerProxy.prototype.getContainer = function (id) {
  return PromiseProxy(this.$subject.getContainer(id));
};

module.exports = DockerProxy;