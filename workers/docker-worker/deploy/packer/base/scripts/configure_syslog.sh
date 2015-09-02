#! /bin/bash

set -e -x -v

RSYSLOG_DIRECTORY=/etc/rsyslog.d
DOCKER_WORKER_RSYSLOG_CONFFILE=0-docker-worker.conf

cat << EOF > $DOCKER_WORKER_RSYSLOG_CONFFILE
\$DefaultNetstreamDriverCAFile /etc/papertrail-bundle.pem # trust these CAs
\$ActionSendStreamDriver gtls # use gtls netstream driver
\$ActionSendStreamDriverMode 1 # require TLS
\$ActionSendStreamDriverAuthMode x509/name # authenticate by hostname
\$ActionSendStreamDriverPermittedPeer *.papertrailapp.com
\$ActionResumeInterval 10
\$ActionQueueSize 100000
\$ActionQueueDiscardMark 97500
\$ActionQueueHighWaterMark 80000
\$ActionQueueType LinkedList
\$ActionQueueFileName papertrailqueue
\$ActionQueueCheckpointInterval 100
\$ActionQueueMaxDiskSpace 2g
\$ActionResumeRetryCount -1
\$ActionQueueSaveOnShutdown on
\$ActionQueueTimeoutEnqueue 10
\$ActionQueueDiscardSeverity 0
*.* @@$PAPERTRAIL
EOF

sudo mv $DOCKER_WORKER_RSYSLOG_CONFFILE $RSYSLOG_DIRECTORY
