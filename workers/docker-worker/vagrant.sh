#! /bin/bash

set -e -v -x

sudo ln -s /vagrant /worker

NODE_VERSION=v8.6.0
DOCKER_VERSION=1.12.6-0~ubuntu-trusty

# Kernels < 3.13.0.77 and > 3.13.0.71 have an AUFS bug which can cause docker
# containers to not exit properly because of zombie processes that can't be reaped.
KERNEL_VER=3.13.0-79-generic
V4L2LOOPBACK_VERSION=0.8.0

lsb_release -a

# add docker group and add current user to it
sudo groupadd docker
sudo usermod -a -G docker vagrant

sudo apt-get update -y

[ -e /usr/lib/apt/methods/https ] || {
  apt-get install apt-transport-https
}

# Add docker gpg key and update sources
sudo apt-key adv --keyserver hkp://p80.pool.sks-keyservers.net:80 --recv-keys 58118E89F3A912897C070ADBF76221572C52609D
sudo sh -c "echo deb https://apt.dockerproject.org/repo ubuntu-trusty main\
> /etc/apt/sources.list.d/docker.list"

## Update to pick up new registries
sudo apt-get update -y

## Update kernel
sudo apt-get install -y \
    linux-image-$KERNEL_VER \
    linux-headers-$KERNEL_VER \
    linux-image-extra-$KERNEL_VER \
    linux-image-extra-virtual \
    dkms


## Install all the packages
sudo apt-get install -y \
    unattended-upgrades \
    docker-engine=$DOCKER_VERSION \
    btrfs-tools \
    lvm2 \
    curl \
    build-essential \
    git-core \
    gstreamer0.10-alsa \
    gstreamer0.10-plugins-bad \
    gstreamer0.10-plugins-base \
    gstreamer0.10-plugins-good \
    gstreamer0.10-plugins-ugly \
    gstreamer0.10-tools \
    pbuilder \
    python-mock \
    python-configobj \
    python-support \
    cdbs \
    python-pip \
    jq \
    rsyslog-gnutls \
    openvpn \
    lxc

# Install node
cd /usr/local/ && \
  curl https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.gz | tar -xz --strip-components 1 && \
  node -v

# Install some necessary node packages
npm install -g yarn@1.0.2 babel-cli

# Install Video loopback devices
sudo apt-get install -y \
    v4l2loopback-utils \
    gstreamer0.10-plugins-ugly \
    gstreamer0.10-plugins-good \
    gstreamer0.10-plugins-bad

sh -c 'echo "v4l2loopback" >> /etc/modules'

cat << EOF > /etc/modprobe.d/test-modules.conf
options v4l2loopback devices=100
EOF

sudo modprobe v4l2loopback

# Install Audio loopback devices
sh -c 'echo "snd-aloop" >> /etc/modules'

cat << EOF > /etc/modprobe.d/test-modules.conf
options snd-aloop enable=1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1 index=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29
EOF
sudo modprobe snd-aloop

# Create dependency file
depmod
