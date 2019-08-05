module github.com/taskcluster/taskcluster/clients/client-go/v16

go 1.12

require (
	github.com/cenkalti/backoff v2.1.1+incompatible // indirect
	github.com/fatih/camelcase v1.0.0 // indirect
	github.com/ghodss/yaml v1.0.0 // indirect
	github.com/streadway/amqp v0.0.0-20190404075320-75d898a42a94
	github.com/taskcluster/httpbackoff v1.0.0
	github.com/taskcluster/jsonschema2go v1.0.0
	github.com/taskcluster/pulse-go v1.0.0
	github.com/taskcluster/slugid-go v1.1.0
	github.com/taskcluster/taskcluster-base-go v1.0.0
	github.com/taskcluster/taskcluster-lib-urls v12.0.0+incompatible
	github.com/tent/hawk-go v0.0.0-20161026210932-d341ea318957
	golang.org/x/tools v0.0.0-20190722020823-e377ae9d6386
	gopkg.in/yaml.v2 v2.2.2 // indirect
	launchpad.net/gocheck v0.0.0-00010101000000-000000000000 // indirect
)

// launchpad.net is a bzr repo, and we do not want to require bzr to be installed just for
// a test requirement of an outdated dependency, so rewrite this to a github repo.
replace launchpad.net/gocheck => github.com/go-check/check v0.0.0-20140401040844-163297374fe1
