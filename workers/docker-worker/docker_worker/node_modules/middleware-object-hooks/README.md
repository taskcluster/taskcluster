# middleware-object-hooks

[![Build Status](https://travis-ci.org/lightsofapollo/middleware-object-hooks.png?branch=master)](https://travis-ci.org/lightsofapollo/middleware-object-hooks)

Middleware(ish) hooks based on "methods" in objects.


## Usage

(Also see [examples/](examples/))

```js
var middleware = require('middleware-object-hooks');

middlware.use({
  start: function(value) {
    value.calls = value.calls || 0;
    return value;
  }
});

middlware.use({
  start: function(value) {
    value.calls++;
  }  
});

middlware.use({
  start: function() {
    return new Promise(function(accept, reject) {
      // do some magic then accept / reject
    });
  }
});

middlware.run(
  'start', // method in the middleware
  {
    // passed to the method in the middleware  
  }
).then(
  function(value) {
  },

  function(err) {
  }
);
```

## Notes

 - Middleware methods are invoked within the context of their object

 - Multiple values may be passed to run (or none at all)

 - Each result is passed directly to the next middleware so its possible
   to both mutate the value (if its an object) and entirely replace it.
