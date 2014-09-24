#! /bin/bash -vex

## Install diamond
git clone https://github.com/BrightcoveOS/Diamond diamond

## Build stuff inside of it
cd diamond
make builddeb
sudo dpkg -i build/diamond_*_all.deb

## Copy initial diamond config in the right location for app to configure
sudo cp /etc/diamond/diamond.conf.example /etc/diamond/diamond.conf
