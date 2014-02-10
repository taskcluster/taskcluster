suite('proxy benchmarking', function() {
  var fs = require('fs'),
      Promise = require('promise'),
      Proxy = require('../');

  var obj = {
    noop: function(callback) {
      setImmediate(callback);
    }
  };

  var fsProxy = new Proxy(Promise, fs);

  bench('build proxy', function() {
    var prox = new Proxy(Promise, fs);
  });

  var prox = new Proxy(Promise, obj);
  bench('proxy noop', function(done) {
    prox.noop(done);
  });

  bench('call proxy (baseline)', function(done) {
    obj.noop(done);
  });

  bench('new promise time', function(done) {
    var promise = new Promise(function(accept) {
      accept();
    });

    promise.then(done);
  });
});
