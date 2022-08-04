#! /bin/sh

if grep -Fxq '127.0.1.1 taskcluster' /etc/hosts; then
  echo '127.0.1.1 taskcluster' >> /etc/hosts
fi

run_standalone() {
  echo "Running standalone worker"
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

  generic-worker --version
  generic-worker run --config /etc/generic-worker/config.json
}

run_static() {
  echo "Running static worker"
  if [ ! -f /etc/generic-worker/worker-runner.json ]
  then
    echo "No /etc/generic-worker/worker-runner.json found, please create one"
    echo "Example config.json:"
    echo '{'
    echo '  "worker": {'
    echo '    "implementation": "generic-worker",'
    echo '    "path": "/usr/local/bin/generic-worker",'
    echo '    "configPath": "/etc/generic-worker/config-worker-runner.yml"'
    echo '  },'
    echo '  "provider": {'
    echo '    "providerID": "static",'
    echo '    "providerType": "static",'
    echo '    "rootURL": "http://taskcluster/",'
    echo '    "workerID": "vm-1",'
    echo '    "workerGroup": "local",'
    echo '    "workerPoolID": "docker-compose/generic-worker",'
    echo '    "workerNodeType": "generic-worker",'
    echo '    "staticSecret": "---static-secret---"'
    echo '  },'
    echo '  "workerConfig": {'
    echo '    "ed25519SigningKeyLocation": "/etc/generic-worker/ed25519_key",'
    echo '    "shutdown": {'
    echo '      "enabled": false'
    echo '    }'
    echo '  }'
    echo '}'
    exit 2
  fi

  # # this is for local development/testing purposes only
  # worker pool is provisioned by tc-admin locally

  # echo "Ensure worker is created"
  echo '{"expires": "2033-01-01 12:12:12", "providerInfo": { "staticSecret": "NMd5YFgrZZHmAejHUNhNWKcEtfRwtHeME6wdESMf798V"}}' | \
    taskcluster api workerManager createWorker docker-compose/generic-worker local vm-1

  start-worker /etc/generic-worker/worker-runner.json
}

case "${1}" in
static) run_static;;
standalone) run_standalone;;
*) run_standalone;;
esac
