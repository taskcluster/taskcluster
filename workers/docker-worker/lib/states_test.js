suite('states', function() {
  var co = require('co');

  var States = require('./states');

  suite('#link', function() {
    test('empty links', co(function* () {
      var subject = new States([]);
      assert.deepEqual((yield subject.link()), []);
    }));

    test('many links', co(function* () {
      var task = {};
      var hooks = [
        {
          link: function* (given) {
            assert.equal(task, given);
            return [{ name: 'xfoo', alias: 'bar' }]
          }
        },

        {
          link: function* (given) {
            assert.equal(task, given);
            return [
              { name: '1', alias: '1' },
              { name: '2', alias: '2' }
            ]
          }
        }
      ];

      var subject = new States(hooks);
      var result = yield subject.link(task);

      assert.deepEqual(result.sort(), [
        { name: 'xfoo', alias: 'bar' },
        { name: '1', alias: '1' },
        { name: '2', alias: '2' }
      ].sort());
    }));
  });

  function invoked(name) {
    suite('#' + name, function() {
      test('empty', co(function* () {
        var subject = new States([]);
        yield subject[name]();
      }));

      test('invoked', co(function* () {
        var task = {};
        var calledInner = false;
        var hook = {};

        hook[name] = function* (given) {
          calledInner = true;
          assert.equal(task, given);
        }

        var hooks = [hook];

        var subject = new States(hooks);

        yield subject[name](task);
        assert.ok(calledInner), 'invoked handler';
      }));
    });
  }

  invoked('created');
  invoked('stopped');
  invoked('killed');
});
