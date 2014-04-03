#! /bin/bash -vxe

# Update your sources
sudo apt-get update
sudo apt-get upgrade -y

# Install LVM2
sudo apt-get install -y lvm2

# Actual lvm configuration can first be done at launch time, as we don't know
# how many instance storage devices we have available.
