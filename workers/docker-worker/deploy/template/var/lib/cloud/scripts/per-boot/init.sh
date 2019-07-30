#! /bin/bash -e

# Bug 1570160 -- this is temporary until we get a better way to correlate
# tasks with the log identifier of the worker that ran them.
if curl --fail -q http://169.254.169.254/latest/meta-data 2>/dev/null; then
    echo "Running in EC2; resetting logging hostname"
    # On startup define the new syslog hostname
    echo "\$LocalHostName $(docker-worker-host instance)" > /etc/rsyslog.d/1-hostname.conf
    sudo service rsyslog restart
fi
