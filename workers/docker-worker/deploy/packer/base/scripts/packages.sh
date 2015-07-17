#! /bin/bash -vex
lsb_release -a

# add docker group and add current user to it
sudo groupadd docker
sudo usermod -a -G docker $USER

[ -e /usr/lib/apt/methods/https ] || {
  apt-get update
  apt-get install apt-transport-https
}

sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 36A1D7869245C8950F966E92D8576A8BA88D21E9
sudo sh -c "echo deb https://get.docker.io/ubuntu docker main\
> /etc/apt/sources.list.d/docker.list"

## Update to pick up new registries
sudo apt-get update -y

## Install all the packages
sudo apt-get install -y lxc-docker-1.6.1 btrfs-tools lvm2 curl build-essential \
  linux-image-extra-`uname -r` git-core pbuilder python-mock python-configobj \
  python-support cdbs python-pip jq rsyslog-gnutls openvpn v4l2loopback-utils lxc

## Clear mounts created in base image so fstab is empty in other builds...
sudo sh -c 'echo "" > /etc/fstab'
