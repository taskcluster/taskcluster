module github.com/taskcluster/taskcluster/clients/client-go/v24

go 1.12

require (
	github.com/fatih/camelcase v1.0.0 // indirect
	github.com/ghodss/yaml v1.0.0 // indirect
	github.com/streadway/amqp v0.0.0-20190827072141-edfb9018d271
	github.com/taskcluster/httpbackoff/v3 v3.0.0
	github.com/taskcluster/jsonschema2go v1.0.0
	github.com/taskcluster/pulse-go v1.0.0
	github.com/taskcluster/slugid-go v1.1.0
	github.com/taskcluster/taskcluster-base-go v1.0.0
	github.com/taskcluster/taskcluster-lib-urls v12.0.0+incompatible
	github.com/tent/hawk-go v0.0.0-20161026210932-d341ea318957
	github.com/xeipuuv/gojsonpointer v0.0.0-20190905194746-02993c407bfb // indirect
	github.com/xeipuuv/gojsonreference v0.0.0-20180127040603-bd5ef7bd5415 // indirect
	github.com/xeipuuv/gojsonschema v1.1.0 // indirect
	golang.org/x/tools v0.0.0-20190719005602-e377ae9d6386
	gopkg.in/yaml.v2 v2.2.2 // indirect
)

// https://bugzilla.mozilla.org/show_bug.cgi?id=1580513
replace gopkg.in/yaml.v2 => github.com/go-yaml/yaml v0.0.0-20181115110504-51d6538a90f8

replace gopkg.in/check.v1 => github.com/go-check/check v0.0.0-20190902080502-41f04d3bba15
