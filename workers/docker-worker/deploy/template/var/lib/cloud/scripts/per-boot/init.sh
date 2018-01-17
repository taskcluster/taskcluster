#! /bin/bash -e

# On startup define the new syslog hostname
echo "\$LocalHostName $(docker-worker-host instance)" > /etc/rsyslog.d/1-hostname.conf
sudo service rsyslog restart
