#! /bin/bash -vex

node_version=0.12.4
url=http://nodejs.org/dist/v$node_version/node-v$node_version-linux-x64.tar.gz

# Download and install node to the /usr/ directory
sudo curl $url > /tmp/node-$node_version.tar.gz
sudo tar xzf /tmp/node-$node_version.tar.gz \
        -C /usr/local/ --strip-components=1

# test it out
node --version
