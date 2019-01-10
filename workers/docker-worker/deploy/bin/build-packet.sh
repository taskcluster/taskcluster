#!/bin/bash -vex

pushd ..
docker build -t docker-worker -f Dockerfile.packet .
docker save -o /tmp/docker-worker.tar docker-worker
sudo deploy/bin/packet-save2image < /tmp/docker-worker.tar > image.tar.gz
mkdir /tmp/image
! tar -xzf image.tar.gz -C /tmp/image
cp $(ls -1 /tmp/image/boot/vmlinuz* | tail -1) vmlinuz
cp $(ls -1 /tmp/image/boot/initrd* | tail -1) initrd
mkdir image-temp
cp -R /tmp/image/lib/modules/$(ls -1 /tmp/image/lib/modules/ | tail -1) image-temp
tar -czf kernel.tar.gz vmlinuz
tar -czf initrd.tar.gz initrd
tar -czf modules.tar.gz image-temp
rm -rf vmlinuz initrd image-temp /tmp/image
popd
