/**
Ghetto shutdown script... this forces a shutdown (kill) of a docker container.
*/
let dockerOpts = require('dockerode-options');

let Docker = require('dockerode-promise');

// conatiner to kill is always the first arg to this script don't be fancy.
let containerId = process.argv[2];
let docker = new Docker(dockerOpts());
let container = docker.getContainer(containerId);
container.kill();
