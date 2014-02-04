#! /bin/bash -vex

# docker_worker_source that needs to be untar'ed
docker_worker_source=$1
upstart_conf=$2
upstart_defaults=$3

sudo mv $upstart_conf /etc/init/docker-worker.conf
sudo mv $upstart_defaults /etc/default/docker-worker

target=$HOME/docker_worker
mkdir -p $target
cd $target
tar xzf $docker_worker_source -C $target --strip-components=1
sudo chown -R $USER:$USER /home/ubuntu/docker_worker
npm install --production
npm rebuild
