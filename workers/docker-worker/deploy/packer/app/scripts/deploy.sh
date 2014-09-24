#! /bin/bash -vex

# pip deps
sudo pip install python-statsd influxdb

# template source which must override system files.
template_source=$1

# docker_worker_source that needs to be untar'ed
docker_worker_source=$2

# install the system configuration
sudo tar xzf $template_source -C / --strip-components=1

# install the node app.
target=$HOME/docker_worker
mkdir -p $target
cd $target
tar xzf $docker_worker_source -C $target --strip-components=1
sudo chown -R $USER:$USER /home/ubuntu/docker_worker
npm install --production
npm rebuild
