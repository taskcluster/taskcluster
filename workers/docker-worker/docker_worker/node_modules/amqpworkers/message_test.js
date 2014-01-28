suite('amqp/message', function() {
  var JSONMime = 'application/json';
  var Message = require('./message');

  var object = { woot: true };


  test('no options', function() {
    var subject = new Message(object);

    assert.deepEqual(
      subject.buffer.toString(),
      (new Buffer(JSON.stringify(object))).toString()
    );

    assert.equal(
      subject.options.contentType,
      JSONMime
    );
  });

  test('options no content type override', function() {
    var subject = new Message(object, {
      priority: 1
    });

    assert.equal(
      subject.options.priority,
      1,
      '.priority'
    );

    assert.equal(subject.options.contentType, JSONMime);
  });

  test('options with content type override', function() {
    var buffer = new Buffer('xxx');

    var subject = new Message(buffer, {
      contentType: 'text/plain'
    });

    assert.equal(subject.buffer, buffer, '.buffer');
    assert.equal(subject.options.contentType, 'text/plain');
  });
});
