#!/bin/bash
trap 'kill -TERM $PID' TERM INT
(
	exec "$@"
)
PID=$!
wait $PID
trap - TERM INT
wait $PID
EXIT_STATUS=$?
sleep 5
flock -x /.taskclusterinteractivesession.lock true
exit $EXIT_STATUS
