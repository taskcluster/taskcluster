suite('List hook groups', function () {
  var debug = require('debug')('test:api:listhookgroups');
  var assume = require('assume');
  var helper = require('./helper');

  test("groups returns all valid groups", async () => {
    var taskDef = require('./test_definition');
    var input = ['foo', 'bar', 'baz', 'qux'];
    debug('### Create hooks');
    var group;
    for (group in input) {
      await helper.hooks.createHook(group, 'testHook', taskDef);
    }

    var r1 = await helper.hooks.listHookGroups();
    assume(r1.groups.length).equals(input.length);
  });
});
