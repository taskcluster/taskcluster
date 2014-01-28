suite('group dependencies', function() {
  var subject = require('./');

  suite('cyclic', function() {
    var groups = {
      sharedQueue: ['queue'],
      queue: ['sharedQueue']
    };

    test('group dependencies', function() {
      assert.throws(function() {
        subject(groups);
      }, /sharedQueue/);
    });
  });

  suite('single root with no deps', function() {
    var groups = {
      root: null
    };

    test('should handle null groups', function() {
      var out = subject(groups, ['root']);
      console.log(out);
      assert.deepEqual(
        subject(groups, ['root']),
        [['root']]
      );
    });
  });

  suite('lower and higher deps on same node', function() {
    var groups = {
      db: ['monit', 'xvfb'],
      xvfb: ['monit'],
      monit: []
    };

    // optimal grouping
    var idealOrder = [
      ['monit'],
      ['xvfb'],
      ['db']
    ];

    test('group dependencies', function() {
      assert.deepEqual(
        subject(groups),
        idealOrder
      );
    });
  });

  suite('multi-tier', function() {
    var groups = {
      worker: ['queue'],
      appworker: ['worker'],
      app: ['db', 'queue'],
      db: ['monit', 'xvfb'],
      queue: ['monit', 'amqp'],
      monit: [],
      xvfb: ['monit'],
      amqp: []
    };

    // optimal grouping
    var idealOrder = [
      ['monit', 'amqp'],
      ['queue', 'xvfb'],
      ['worker', 'db'],
      ['appworker', 'app']
    ];

    test('group dependencies', function() {
      assert.deepEqual(
        subject(groups),
        idealOrder
      );
    });

    test('specific single root', function() {
      assert.deepEqual(
        subject(groups, ['db']),
        [
          ['monit'],
          ['xvfb'],
          ['db']
        ]
      );
    });

    test('multiple roots', function() {
      assert.deepEqual(
        subject(groups, ['monit', 'worker']),
        [
          ['monit', 'amqp'],
          ['queue'],
          ['worker']
        ]
      );
    });
  });
});
