# taskcluster-client.go
<img hspace="20" align="left" src="https://tools.taskcluster.net/lib/assets/taskcluster-120.png" />
[![Build Status](https://secure.travis-ci.org/petemoore/taskcluster-client-go.png)](http://travis-ci.org/petemoore/taskcluster-client-go)
[![GoDoc](https://godoc.org/github.com/petemoore/taskcluster-client-go?status.png)](https://godoc.org/github.com/petemoore/taskcluster-client-go)

A go (golang) port of taskcluster-client

Complete godoc documentation here: http://godoc.org/github.com/petemoore/taskcluster-client-go

This library provides six packages to interface with TaskCluster.

### HTTP APIs
* http://godoc.org/github.com/petemoore/taskcluster-client-go/auth
* http://godoc.org/github.com/petemoore/taskcluster-client-go/index
* http://godoc.org/github.com/petemoore/taskcluster-client-go/queue
* http://godoc.org/github.com/petemoore/taskcluster-client-go/scheduler

### AMQP APIS
* http://godoc.org/github.com/petemoore/taskcluster-client-go/queueevents
* http://godoc.org/github.com/petemoore/taskcluster-client-go/schedulerevents

Please also see the example programs provided:
* [auth example](https://github.com/petemoore/taskcluster-client-go/blob/master/auth/examples/modifyclient/modifyclient.go)
* [queueevents example](https://github.com/petemoore/taskcluster-client-go/blob/master/queueevents/examples/tctasksniffer/sniffer.go)

# Contributing
Contributions are welcome. Please fork, and issue a Pull Request back with an explanation of your changes.

# Travis
Travis build success/failure messages are posted to irc channel #tcclient-go on irc.mozilla.org:6697.
