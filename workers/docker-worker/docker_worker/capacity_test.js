suite('capacity', function() {
  var Capacity = require('./capacity');
  var Promise = require('promise');

  var subject;
  setup(function() {
    subject = new Capacity(8);
  });

  test('.available - without work', function() {
    assert.equal(subject.available, 8);
  });

  suite('#push', function() {
    test('add an item', function() {
      var emitted;
      subject.once('pop', function() {
        assert.equal(subject.available, subject.maximumSize);
        emitted = true;
      });

      var promise = subject.push(Promise.from(null));
      assert.equal(subject.available, subject.maximumSize - 1);

      return promise.then(function() {
        assert.ok(emitted, 'emits pop');
        assert.equal(subject.available, subject.maximumSize);
      });
    });
  });
});
