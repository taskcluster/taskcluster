#! /bin/bash -vex

## Get recent CA bundle for papertrail
sudo curl -o /etc/papertrail-bundle.pem https://papertrailapp.com/tools/papertrail-bundle.pem
md5=md5sum /etc/papertrail-bundle.pem | awk '{ print $1 }'
if [ $md5 != "c75ce425e553e416bde4e412439e3d09" ]; then
    echo "md5 for papertrail CA bundle does not match"
    exit -1
fi

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
sudo npm install -g babel@4.7.16

sudo sh -c 'echo "v4l2loopback" >> /etc/modules'
sudo sh -c 'echo "snd-aloop" >> /etc/modules'
sudo depmod
