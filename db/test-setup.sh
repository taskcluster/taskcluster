#! /bin/bash

if [ -n "${TASK_ID}" ]; then
    echo "This script is only intended for use in CI."
fi

# add an HBA entry to allow any user, not just postgres, to connect
echo 'host all all 127.0.0.1/32 trust' >> /etc/postgresql/11/main/pg_hba.conf

# start the server
echo "Starting pg server.."
pg_ctlcluster 11 main start
