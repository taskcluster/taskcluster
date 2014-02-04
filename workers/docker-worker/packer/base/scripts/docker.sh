#!/bin/bash
sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 36A1D7869245C8950F966E92D8576A8BA88D21E9

# Add the Docker repository to your apt sources list.
sudo sh -c "echo deb http://get.docker.io/ubuntu docker main\
> /etc/apt/sources.list.d/docker.list"

# add docker group and add vagrant to it
sudo groupadd docker
sudo usermod -a -G docker $USER

# install curl
sudo apt-get update
sudo apt-get install -y -q curl

# add the docker gpg key
sudo curl https://get.docker.io/gpg | apt-key add -

# Update your sources
sudo apt-get update
sudo apt-get upgrade -y

# Install. Confirm install.
sudo apt-get install -y -q lxc-docker
