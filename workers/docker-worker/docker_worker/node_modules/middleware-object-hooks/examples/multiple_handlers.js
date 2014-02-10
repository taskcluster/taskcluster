var middleware = require('..')();

function startCheck() {
  var started;
  return {
    start: function(value) {
      started = true;
      return value;
    },

    end: function(value) {
      value.calls = value.calls || 0;
      value.calls++;

      value.started = started;
      return value;
    }
  };
}

middleware.use(startCheck());
middleware.use({
  end: function(value) {
    // increment some magic number
    value.calls = value.calls || 0;
    value.calls++;

    value.ended = true;
    return value;
  }
});

module.exports = middleware;
