#! /bin/bash -vex

sudo ln -s /vagrant /worker

# Install node
export NODE_VERSION=v0.12.4
cd /usr/local/ && \
  curl https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.gz | tar -xz --strip-components 1 && \
  node -v


sudo apt-get update
sudo apt-get install -y lxc build-essential jq

# Install nice-to-haves
sudo apt-get install -y jq

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
