#!/bin/bash

if [ -z "${TASK_ID}" ]; then
    echo "This script is only intended for use in CI."
    exit 1;
fi

# (redundant to the same script in the docker image; this can be removed a day or two after #3116 lands)
pg_version=11
echo 'local all all trust' > /etc/postgresql/$pg_version/main/pg_hba.conf
echo 'host all all 127.0.0.1/32 trust' >> /etc/postgresql/$pg_version/main/pg_hba.conf
echo 'host all all ::1/128 trust' >> /etc/postgresql/$pg_version/main/pg_hba.conf

# start the server
echo "Starting pg server.."
pg_ctlcluster 11 main start

# if necessary, create the required users
if [ "$1" = "--users" ]; then
    echo "Creating per-service users.."
    psql -U postgres -h localhost postgres <<'EOF'
-- BEGIN CREATE USERS --
CREATE USER test_auth;
CREATE USER test_github;
CREATE USER test_hooks;
CREATE USER test_index;
CREATE USER test_notify;
CREATE USER test_object;
CREATE USER test_purge_cache;
CREATE USER test_queue;
CREATE USER test_secrets;
CREATE USER test_web_server;
CREATE USER test_worker_manager;
-- END CREATE USERS --
EOF
fi
