#! /bin/bash -vex

## Get recent CA bundle for papertrail
sudo curl -o /etc/papertrail-bundle.pem https://papertrailapp.com/tools/papertrail-bundle.pem
md5=md5sum /etc/papertrail-bundle.pem | awk '{ print $1 }'
if [ $md5 != "c75ce425e553e416bde4e412439e3d09" ]; then
    echo "md5 for papertrail CA bundle does not match"
    exit -1
fi

# pip deps
sudo pip install python-statsd

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

sudo npm install -g yarn@1.0.2

yarn install --frozen-lockfile

# Initialize video and sound loopback modules
sudo modprobe v4l2loopback
sudo modprobe snd-aloop
# Create dependency file
sudo depmod

# Pull images used for sidecar containers
docker pull taskcluster/taskcluster-proxy:4.0.1
docker pull taskcluster/livelog:v4
docker pull taskcluster/dind-service:v4.0
docker pull taskcluster/relengapi-proxy:2.0.1

# Export the images as a tarball to load when insances are initialized
docker save taskcluster/taskcluster-proxy:4.0.1 taskcluster/livelog:v4 taskcluster/dind-service:v4.0 taskcluster/relengapi-proxy:2.0.1 > /home/ubuntu/docker_worker/docker_worker_images.tar

# Blow away local docker state because it is never used. On actual workers
# per-instance storage is initialized and Docker state goes there.
sudo service docker stop
sudo rm -rf /var/lib/docker
# Blow away the upstart log so logs on worker instances don't contain
# our logs.
sudo rm /var/log/upstart/docker.log
