function proxy(method) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    var subject = this.subject;

    return new this.Promise(function(accept, reject) {
      args.push(function(err, value) {
        if (err) return reject(err);
        accept(value);
      });

      try {
        subject[method].apply(subject, args);
      } catch (e) {
        reject(e);
      }
    });
  }
}

function Proxy(Promise, object) {
  if (!(this instanceof Proxy)) return new Proxy(Promise, object);
  if (object.$proxypromiseobject) return object;

  this.Promise = Promise;
  this.subject = object;
  this.$proxypromiseobject = true;

  for (var key in object) {
    if (typeof object[key] !== 'function') continue;
    this[key] = proxy(key);
  }
}

module.exports = Proxy;
