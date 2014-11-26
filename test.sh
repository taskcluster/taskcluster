#!/bin/bash
PYTHON=${PYTHON-python}
NODE_BIN=${NODE_BIN-node}
NPM=${NPM-npm}
FLAKE8=${FLAKE8-flake8}
NOSE=${NOSE-nosetests}
export PORT=${PORT-5555}

echo | nc localhost $PORT -w 1 &> /dev/null
if [ $? -eq 0 ] ; then
	echo Server already running
	exit 1
fi

$NODE_BIN test/mockAuthServer.js &> server.log &
server=$!

ps -p $server &> /dev/null
if [ $? -ne 0 ] ; then
	echo "Server did not start cleanly"
	exit 1
fi

echo Linting
$FLAKE8 --ignore=E111,E121 \
	--max-line-length=120 \
	taskcluster test
lint=$?
echo Done linting

echo setup.py tests
$PYTHON setup.py test
setuptests=$?

echo nosetests
$NOSE
nose=$?

kill $server
if [ $? -ne 0 ] ; then
	echo "Failed to kill server"
fi
echo Done testing!

exit $(( nose + lint + setuptests ))
