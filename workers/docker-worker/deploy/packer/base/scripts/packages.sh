#! /bin/bash

set -e -v

DOCKER_VERSION=5:18.09.5~3-0~ubuntu-bionic
KERNEL_VER=4.15.0-47-generic
V4L2LOOPBACK_VERSION=0.12.0

lsb_release -a

# add docker group and add current user to it
sudo groupadd -f docker

# Make sure we use add the calling user to docker
# group. If the the script itself is called with sudo,
# we must use SUDO_USER, otherwise, use USER.
if [ -z "${VAGRANT_PROVISION}" ]; then
    user=$USER
else
    user=$SUDO_USER
fi

sudo usermod -a -G docker $user

sudo apt-get install -yq \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg-agent \
    software-properties-common

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

sudo apt-key fingerprint 0EBFCD88

sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"

## Update to pick up new registries
sudo apt-get update -y

# Upgrade to the latest aws kernel. If not, a bug in apt-get remove
# may install a newer kernel after we remove the old one
sudo apt-get install -yq unattended-upgrades
sudo unattended-upgrades
sudo apt-get auto-remove -y

# Uninstall aws kernels
sudo DEBIAN_FRONTEND=noninteractive apt-get remove -yq \
    $(ls -1 /boot/vmlinuz-*aws | sed -e 's,/boot/vmlinuz,linux-image,')

# Update kernel
# We install the generic kernel because it has the V4L2 driver
sudo DEBIAN_FRONTEND=noninteractive apt-get install -yq \
    linux-image-$KERNEL_VER \
    linux-headers-$KERNEL_VER \
    linux-modules-$KERNEL_VER \
    linux-modules-extra-$KERNEL_VER \
    dkms

## Install all the packages
sudo DEBIAN_FRONTEND=noninteractive apt-get install -yq \
    docker-ce=$DOCKER_VERSION \
    lvm2 \
    curl \
    build-essential \
    git-core \
    gstreamer1.0-alsa \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-tools \
    pbuilder \
    python-mock \
    python-configobj \
    dh-python \
    cdbs \
    python-pip \
    jq \
    rsyslog-gnutls \
    openvpn \
    rng-tools \
    liblz4-tool

# Remove apport because it prevents obtaining crashes from containers
# and because it may send data to Canonical.
sudo apt-get purge -y apport

# Clone and build Zstandard
sudo git clone https://github.com/facebook/zstd /zstd
cd /zstd
# Corresponds to v1.3.3.
sudo git checkout f3a8bd553a865c59f1bd6e1f68bf182cf75a8f00
sudo make zstd
sudo mv zstd /usr/bin
cd /
sudo rm -rf /zstd


## Install v4l2loopback
cd /usr/src
sudo rm -rf v4l2loopback-$V4L2LOOPBACK_VERSION
sudo git clone --branch v$V4L2LOOPBACK_VERSION https://github.com/umlaeute/v4l2loopback.git v4l2loopback-$V4L2LOOPBACK_VERSION
cd v4l2loopback-$V4L2LOOPBACK_VERSION
sudo dkms install -m v4l2loopback -v $V4L2LOOPBACK_VERSION -k ${KERNEL_VER}
sudo dkms build -m v4l2loopback -v $V4L2LOOPBACK_VERSION -k ${KERNEL_VER}

echo "v4l2loopback" | sudo tee --append /etc/modules

sudo sh -c 'echo "options v4l2loopback devices=100" > /etc/modprobe.d/v4l2loopback.conf'

# Install Audio loopback devices
echo "snd-aloop" | sudo tee --append /etc/modules
sudo sh -c 'echo "options snd-aloop enable=1,1,1,1,1,1,1,1 index=0,1,2,3,4,5,6,7" > /etc/modprobe.d/snd-aloop.conf'

# For some unknown reason, the kernel doesn't load snd-aloop even with
# it listed in /etc/modules, with no trace in dmesg. We put it here to make
# sure it is loaded during system startup.
sudo bash -c 'cat > /etc/rc.local <<EOF
#!/bin/sh -e
modprobe snd-aloop
exit 0
EOF'
sudo chmod +x /etc/rc.local

# Do one final package cleanup, just in case.
sudo apt-get autoremove -y
