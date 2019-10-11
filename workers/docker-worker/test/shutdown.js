/**
Ghetto shutdown script... this forces a shutdown (kill) of a docker container.
*/
var dockerOpts = require('dockerode-options');

var Docker = require('dockerode-promise');

// conatiner to kill is always the first arg to this script don't be fancy.
var containerId = process.argv[2];
var docker = new Docker(dockerOpts());
var container = docker.getContainer(containerId);
container.kill();
