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
tar xzf $docker_worker_source -C $target
sudo chown -R $USER:$USER /home/ubuntu/docker_worker

sudo npm install -g yarn@1.0.2

while ! yarn install --frozen-lockfile; do
    rm -rf node_modules
    sleep 30
done

# Initialize video and sound loopback modules
sudo modprobe --force-vermagic v4l2loopback
sudo modprobe snd-aloop
# Create dependency file
sudo depmod

relengapi_proxy_version=2.3.1

# Pull images used for sidecar containers
docker pull taskcluster/taskcluster-proxy:5.0.1
docker pull taskcluster/livelog:v4
docker pull taskcluster/dind-service:v4.0
docker pull taskcluster/relengapi-proxy:$relengapi_proxy_version

# Reboot the machine on OOM
# Ref: http://www.oracle.com/technetwork/articles/servers-storage-dev/oom-killer-1911807.html
sudo sh -c 'echo "vm.panic_on_oom=1" >> /etc/sysctl.conf'
sudo sh -c 'echo "kernel.panic=1" >> /etc/sysctl.conf'

# Export the images as a tarball to load when insances are initialized
docker save taskcluster/taskcluster-proxy:5.0.1 taskcluster/livelog:v4 taskcluster/dind-service:v4.0 taskcluster/relengapi-proxy:$relengapi_proxy_version > /home/ubuntu/docker_worker/docker_worker_images.tar

# Blow away local docker state because it is never used. On actual workers
# per-instance storage is initialized and Docker state goes there.
sudo service docker stop
# this device is busy, even after docker has stopped..
# sudo rm -rf /var/lib/docker
# Blow away the upstart log so logs on worker instances don't contain
# our logs.
sudo rm /var/log/upstart/docker.log
