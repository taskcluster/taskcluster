#! /bin/bash

if [ -z "${TASK_ID}" ]; then
    echo "This script is only intended for use in CI."
    exit 1;
fi

# add an HBA entry to allow any user, not just postgres, to connect
echo 'host all all 127.0.0.1/32 trust' >> /etc/postgresql/11/main/pg_hba.conf
echo 'host all all ::1/128 trust' >> /etc/postgresql/11/main/pg_hba.conf

# start the server
echo "Starting pg server.."
pg_ctlcluster 11 main start

# if necessary, create the required users
if [ "$1" = "--users" ]; then
    echo "Creating per-service users.."
    psql -U postgres -h localhost postgres <<'EOF'
-- BEGIN CREATE USERS --
CREATE USER test_notify;
-- END CREATE USERS --
EOF
fi
