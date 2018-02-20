#! /bin/bash

set -e -v

DOCKER_VERSION=17.12.0~ce-0~ubuntu
KERNEL_VER=4.4.0-1014-aws
V4L2LOOPBACK_VERSION=0.10.0

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

[ -e /usr/lib/apt/methods/https ] || {
  apt-get install apt-transport-https
}

sudo apt-get install -y software-properties-common
sudo apt-add-repository ppa:taskcluster/ppa

# Add docker gpg key and update sources
sudo apt-key adv --keyserver hkp://p80.pool.sks-keyservers.net:80 --recv-keys 9DC858229FC7DD38854AE2D88D81803C0EBFCD88
sudo sh -c 'echo "deb [arch=amd64] https://download.docker.com/linux/ubuntu trusty stable" \
  > /etc/apt/sources.list.d/docker.list'

## Update to pick up new registries
sudo apt-get update -y

## Update kernel
sudo apt-get install -y \
    linux-image-$KERNEL_VER \
    linux-headers-$KERNEL_VER \
    dkms

# Clean up old 3.13 kernel.
sudo apt-get remove -y linux-image-extra-virtual
sudo apt-get autoremove -y

if [ -z "${VAGRANT_PROVISION}" ]; then
    # On paravirtualized instances, PV-GRUB looks at /boot/grub/menu.lst, which is different from the
    # /boot/grub/grub.cfg that dpkg just updated.  So we have to update menu.list manually.
    cat <<EOF | sudo tee /boot/grub/menu.lst >&2
default         0
timeout         0
hiddenmenu

title           Ubuntu 14.04.2 LTS, kernel ${KERNEL_VER}
root            (hd0)
kernel          /boot/vmlinuz-${KERNEL_VER} root=LABEL=cloudimg-rootfs ro console=hvc0
initrd          /boot/initrd.img-${KERNEL_VER}

title           Ubuntu 14.04.2 LTS, kernel ${KERNEL_VER} (recovery mode)
root            (hd0)
kernel          /boot/vmlinuz-${KERNEL_VER} root=LABEL=cloudimg-rootfs ro  single
initrd          /boot/initrd.img-${KERNEL_VER}
EOF
fi

## Install all the packages
sudo apt-get install -y \
    unattended-upgrades \
    docker-ce=$DOCKER_VERSION \
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
    lxc \
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

if [ -z "${VAGRANT_PROVISION}" ]; then
    ## Clear mounts created in base image so fstab is empty in other builds...
    sudo sh -c 'echo "" > /etc/fstab'
fi

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
