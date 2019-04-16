#! /bin/bash -vex

## Get recent CA bundle for papertrail
sudo curl -o /etc/papertrail-bundle.pem https://papertrailapp.com/tools/papertrail-bundle.pem
md5=`md5sum /etc/papertrail-bundle.pem | awk '{ print $1 }'`
if [ "$md5" != "2c43548519379c083d60dd9e84a1b724" ]; then
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
sudo npm install -g yarn@1.0.2

# install the node app.
target=$HOME/docker_worker
mkdir -p $target
cd $target
tar xzf $docker_worker_source -C $target
sudo chown -R $USER:$USER /home/ubuntu

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
docker pull taskcluster/taskcluster-proxy:5.1.0
docker pull taskcluster/livelog:v4
docker pull taskcluster/dind-service:v4.0
docker pull taskcluster/relengapi-proxy:$relengapi_proxy_version

# Reboot the machine on OOM
# Ref: http://www.oracle.com/technetwork/articles/servers-storage-dev/oom-killer-1911807.html
sudo sh -c 'echo "vm.panic_on_oom=1" >> /etc/sysctl.conf'
sudo sh -c 'echo "kernel.panic=1" >> /etc/sysctl.conf'

# Export the images as a tarball to load when insances are initialized
docker save taskcluster/taskcluster-proxy:5.1.0 taskcluster/livelog:v4 taskcluster/dind-service:v4.0 taskcluster/relengapi-proxy:$relengapi_proxy_version > /home/ubuntu/docker_worker/docker_worker_images.tar

sudo bash -c 'cat > /lib/systemd/system/docker-worker.service <<EOF
[Unit]
Description=Taskcluster docker worker
After=side-containers.service

[Service]
Type=simple
ExecStart=/usr/local/bin/start-docker-worker
User=root
Environment="HOST=aws"

[Install]
RequiredBy=graphical.target
EOF'

sudo systemctl enable docker-worker.service
sudo systemctl enable side-containers.service
sudo systemctl daemon-reload
