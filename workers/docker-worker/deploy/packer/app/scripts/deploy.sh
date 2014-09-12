#! /bin/bash -vex

sudo apt-get update
# For node dependencies we need make, etc... =/
sudo apt-get install -yq build-essential

# docker_worker_source that needs to be untar'ed
docker_worker_source=$1
upstart_conf=$2
upstart_defaults=$3
upstart_docker_defaults=$4

sudo mv $upstart_conf /etc/init/docker-worker.conf
sudo mv $upstart_defaults /etc/default/docker-worker
sudo mv $upstart_docker_defaults /etc/default/docker

PAPERTRAIL_CONFIG='*.*'
PAPERTRAIL_CONFIG="$PAPERTRAIL_CONFIG @$PAPERTRAIL"

sudo sh -c "echo '$PAPERTRAIL_CONFIG' >> /etc/rsyslog.conf"

target=$HOME/docker_worker
mkdir -p $target
cd $target
tar xzf $docker_worker_source -C $target --strip-components=1
sudo chown -R $USER:$USER /home/ubuntu/docker_worker
npm install --production
npm rebuild
