var Promise = require('promise');
function Middleware() {
  if (!(this instanceof Middleware)) return new Middleware();
  this._objects = [];
}

/**
@param {Object} middleware to add to the stack.
@chainable
*/
Middleware.prototype.use = function(middleware) {
  this._objects.push(middleware);
  return this;
};

/**
Private helper method to resolve hooks.

@param {Array} stack of middleware.
@param {String} method to invoke on middleware.
@param {Array} args extra arguments to pass to middleware.
*/
function reduceInStack(stack, method, args) {
  var middleware = stack.shift();
  var result = middleware[method].apply(middleware, args);

  return Promise.from(result).then(
    function resolveMiddleware(value) {
      if (stack.length === 0) return value;
      return reduceInStack(stack, method, args);
    }
  );
}

/**
Invoke a middleware method.

@param {String} method name to invoke.
@param {Object} [arg...] extra arguments to pass to middleware.
@return {Promise} promise for the final result of the middleware.
*/
Middleware.prototype.run = function() {
  var args = Array.prototype.slice.call(arguments);
  var method = args.shift();

  var stack = this._objects.filter(function(obj) {
    return method in obj;
  });

  // no items on the stack return the "initial" value
  if (!stack.length) return Promise.from(args[0]);

  // run the stack
  return reduceInStack(stack, method, args);
};

module.exports = Middleware;
