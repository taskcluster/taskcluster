#! /bin/bash -vex

# template source which must override system files.
template_source=$1

# docker_worker_source that needs to be untar'ed
docker_worker_source=$2

# the cloud we're in (aws or gcp)
cloud=$3

# where we're deploying
deployment=$4

relengapi_proxy_version=2.3.1
taskcluster_proxy_version=5.1.0
livelog_version=4
dind_service_version=4.0
worker_runner_version=28.0.0

## Get recent CA bundle for papertrail
sudo curl -o /etc/papertrail-bundle.pem https://papertrailapp.com/tools/papertrail-bundle.pem
md5=`md5sum /etc/papertrail-bundle.pem | awk '{ print $1 }'`
if [ "$md5" != "2c43548519379c083d60dd9e84a1b724" ]; then
    echo "md5 for papertrail CA bundle does not match"
    exit -1
fi

# pip deps
sudo pip install python-statsd

# install the system configuration
sudo tar xzf $template_source -C / --strip-components=1

# install the node app.
target=$HOME/docker_worker
mkdir -p $target
cd $target
tar xzf $docker_worker_source -C $target
sudo npm install -g yarn@1.0.2
sudo chown -R $USER:$USER /home/ubuntu/

while ! yarn install --frozen-lockfile; do
    rm -rf node_modules
    sleep 30
done

# Initialize video and sound loopback modules
sudo modprobe --force-vermagic v4l2loopback
sudo modprobe snd-aloop
# Create dependency file
sudo depmod

# Pull images used for sidecar containers
docker pull taskcluster/taskcluster-proxy:$taskcluster_proxy_version
docker pull taskcluster/livelog:v$livelog_version
docker pull taskcluster/dind-service:v$dind_service_version
docker pull taskcluster/relengapi-proxy:$relengapi_proxy_version

# install and configure taskcluster-worker-runner
sudo curl --fail -L -o /usr/local/bin/start-worker https://github.com/taskcluster/taskcluster/releases/download/v$worker_runner_version/start-worker-linux-amd64
sudo chmod +x /usr/local/bin/start-worker

if [ -z "$providerType" ]; then
    if [ "$deployment" = "taskcluster-net" ]; then
        providerType=aws-provisioner
    elif [ "$cloud" = "aws" ]; then
        providerType=aws
    elif [ "$cloud" = "gcp" ]; then
        providerType=google
    fi
fi
if [ -z "$providerType" ]; then
    echo "No provider type for cloud $cloud"
    exit 1
fi

sudo bash -c "cat > /etc/start-worker.yml <<EOF
provider:
    providerType: $providerType
worker:
    implementation: docker-worker
    path: /home/ubuntu/docker_worker
    configPath: /home/ubuntu/worker.cfg
EOF"

# Reboot the machine on OOM
# Ref: http://www.oracle.com/technetwork/articles/servers-storage-dev/oom-killer-1911807.html
sudo sh -c 'echo "vm.panic_on_oom=1" >> /etc/sysctl.conf'
sudo sh -c 'echo "kernel.panic=1" >> /etc/sysctl.conf'

# Export the images as a tarball to load when insances are initialized
docker save \
    taskcluster/taskcluster-proxy:$taskcluster_proxy_version \
    taskcluster/livelog:v$livelog_version \
    taskcluster/dind-service:v$dind_service_version \
    taskcluster/relengapi-proxy:$relengapi_proxy_version \
    > /home/ubuntu/docker_worker/docker_worker_images.tar

sudo bash -c 'cat > /lib/systemd/system/docker-worker.service <<EOF
[Unit]
Description=Taskcluster docker worker
After=side-containers.service

[Service]
Type=simple
ExecStart=/usr/local/bin/start-docker-worker
User=root

[Install]
RequiredBy=graphical.target
EOF'

#sudo systemctl enable docker-worker.service
#sudo systemctl enable side-containers.service
#sudo systemctl daemon-reload
