#! /bin/bash -ve
opts='DOCKER_OPTS=" -H tcp://127.0.0.1:4243 -H unix:///var/run/docker.sock"'

echo $opts > /etc/default/docker
