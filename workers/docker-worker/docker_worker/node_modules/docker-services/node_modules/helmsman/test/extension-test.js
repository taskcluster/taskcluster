var test = require("tap").test;

var helmsman = require('..');

var cli = helmsman({ localDir: './bin' });

test('construct an instance of a helmsman', function(t){
  t.plan(3);

  t.equal(cli.localDir.substr(-8), 'test/bin', 'The localDir is set');
  t.equal(cli.prefix, 'extension-test-', 'The prefix is properly set');
  t.equal(cli.availableCommands.subcommand.description, 'A test', 'A subcommand\'s meta data is loaded');
});
