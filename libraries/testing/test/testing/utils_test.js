suite('testing (utilities)', function() {
  var base    = require('../../');
  var assert  = require('assert');

  test("sleep", function() {
    var nextTickReached = false;
    process.nextTick(function() {
      nextTickReached = true;
    });
    // This will probably work because of promise lib alone, but I don't really
    // care... This is sufficient to test it quickly
    return base.testing.sleep(10).then(function() {
      assert(nextTickReached, "Expected nextTick, before sleep()...");
    });
  });

  test("poll (success)", function() {
    var countDown = 5;
    var poll = function() {
      return base.testing.sleep(1).then(function() {
        countDown -= 1;
        if (countDown === 0) {
          return "success";
        }
        throw new Error("Something bad");
      });
    };

    return base.testing.poll(poll, 5, 5);
  });

  test("poll (too-few iterations)", function() {
    var countDown = 5;
    var poll = function() {
      return base.testing.sleep(1).then(function() {
        countDown -= 1;
        if (countDown === 0) {
          return "success";
        }
        throw new Error("Something bad");
      });
    };

    return base.testing.poll(poll, 4, 5);
  });

  test("poll (terminate early)", function() {
    var countDown = 5;
    var poll = function() {
      return base.testing.sleep(1).then(function() {
        countDown -= 1;
        if (countDown === 0) {
          return "success";
        }
        throw new Error("Something bad");
      });
    };

    return base.testing.poll(poll, 10, 5).then(function() {
      assert(countDown === 0, "Expected 5 iterations only!");
    });
  });
});