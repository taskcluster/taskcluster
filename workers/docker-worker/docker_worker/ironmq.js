var ProxyPromise = require('proxied-promise-object');
var Promise = require('promise');
var IronMQ = require('iron_mq');

module.exports = function ironmq(queue) {
  var instance = new IronMQ.Client({ queue_name: queue });
  return new ProxyPromise(Promise, instance);
};
