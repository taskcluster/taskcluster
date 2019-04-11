#! /bin/bash

set -e -v -x

# This script can run as part of Vagrant provisioning, in which case
# packages.sh isn't present (Vagrantfile executes packages.sh separate).
# Or it can run in standalone, in which case packages.sh is present.
if [ -e deploy/packer/base/scripts/packages.sh ]; then
  . deploy/packer/base/scripts/packages.sh
fi

sudo ln -sf /vagrant /worker

# Force use of overlayfs because aufs (the default) is bad and not used
# in production.
sudo sh -c 'echo "DOCKER_OPTS=\"--storage-driver overlay2\"" > /etc/default/docker'

# Keep in sync with deploy/packer/base/scripts/packages.sh.
NODE_VERSION=v8.15.0

# Install node
cd /usr/local/ && \
  curl https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.gz | sudo tar -xz --strip-components 1 && \
  node -v

# Install some necessary node packages
sudo npm install -g yarn@1.0.2 babel-cli
