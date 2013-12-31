suite('run_task', function() {
  var Promise = require('promise');

  var Docker = require('dockerode');
  var docker;

  setup(function() {
    docker = new Docker({
      host: 'http://localhost', port: 60034
    });
  });
});
