# taskcluster-client-go
<img hspace="20" align="left" src="https://tools.taskcluster.net/lib/assets/taskcluster-120.png" />
[![Build Status](https://travis-ci.org/taskcluster/taskcluster-client-go.svg?branch=master)](http://travis-ci.org/taskcluster/taskcluster-client-go)
[![GoDoc](https://godoc.org/github.com/taskcluster/taskcluster-client-go?status.svg)](https://godoc.org/github.com/taskcluster/taskcluster-client-go)
[![Coverage Status](https://coveralls.io/repos/taskcluster/taskcluster-client-go/badge.svg?branch=master&service=github)](https://coveralls.io/github/taskcluster/taskcluster-client-go?branch=master)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

A go (golang) port of taskcluster-client.

Complete godoc documentation [here](https://godoc.org/github.com/taskcluster/taskcluster-client-go).

This library provides the following packages to interface with TaskCluster:

### HTTP APIs
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/auth
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/awsprovisioner
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/github
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/hooks
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/index
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/login
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/notify
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/purgecache
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/queue
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/scheduler
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/secrets

### AMQP APIs
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/authevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/awsprovisionerevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/githubevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/purgecacheevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/queueevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/schedulerevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/treeherderevents

## Example programs

To get you started quickly, I have also included some example programs that use both the http services and the amqp services:

* This [HTTP example program](http://godoc.org/github.com/taskcluster/taskcluster-client-go/auth#example-package--Scopes) demonstrates the use of the [auth](http://godoc.org/github.com/taskcluster/taskcluster-client-go/auth) package to query the expiry and expanded scopes of a given clientId.
* This [HTTP example program](http://godoc.org/github.com/taskcluster/taskcluster-client-go/auth#example-package--UpdateClient) demonstrates the use of the [auth](http://godoc.org/github.com/taskcluster/taskcluster-client-go/auth) package to update an existing clientId with a new description and expiry.
* The [AMQP example program](http://godoc.org/github.com/taskcluster/taskcluster-client-go/queueevents#example-package--TaskClusterSniffer) demonstrates the use of the [queueevents](http://godoc.org/github.com/taskcluster/taskcluster-client-go/queueevents) package to listen in on Task Cluster tasks being defined and executed.

## Building
The libraries provided by this client are auto-generated based on the schemas listed under
http://references.taskcluster.net/manifest.json combined with the supplementary information stored in
[apis.json](https://github.com/taskcluster/taskcluster-client-go/blob/master/codegenerator/model/apis.json).

In order to completely regenerate all of the HTTP and AMQP libraries, please run [build.sh](https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh)
found in the top level directory. This will completely regenerate the library. Please note you will need an active internet connection as the build process must
download several json files and schemas in order to build the library.

The code which generates the library can all be found under the top level [codegenerator](https://github.com/taskcluster/taskcluster-client-go/tree/master/codegenerator)
directory.

## Contributing
Contributions are welcome. Please fork, and issue a Pull Request back with an explanation of your changes.

## Travis
Travis build [success/failure messages](http://travis-ci.org/taskcluster/taskcluster-client-go) are posted to irc channel #taskcluster-bots on irc.mozilla.org:6697.
