#! /bin/sh

if [ ! -f /etc/generic-worker/config.json ]
then
  echo "No /etc/generic-worker/config.json found, please create one"
  echo "Example config.json:"
  echo "{"
  echo '  "accessToken": "---access--token---,'
  echo '  "clientId": "---client-id----",'
  echo '  "ed25519SigningKeyLocation": "/etc/generic-worker/ed25519_key",'
  echo '  "rootURL": "https://taskcluster.url/",'
  echo '  "workerId": "workerId",'
  echo '  "workerType": "workerType",'
  echo '  "livelogExecutable": "/usr/local/bin/livelog",'
  echo '  "taskclusterProxyExecutable": "/usr/local/bin/taskcluster-proxy",'
  echo '  "publicIP": "127.1.2.3"'
  echo "}"
  exit 2
fi

generic-worker run --config /etc/generic-worker/config.json
