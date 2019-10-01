module github.com/taskcluster/taskcluster/clients/client-shell

go 1.12

require (
	github.com/iancoleman/strcase v0.0.0-20190422225806-e506e3ef7365
	github.com/kr/pretty v0.1.0 // indirect
	github.com/mitchellh/go-homedir v1.1.0
	github.com/pborman/uuid v1.2.0
	github.com/pkg/browser v0.0.0-20190722003412-0a3d74bf9ce4
	github.com/spf13/cobra v0.0.5
	github.com/spf13/pflag v1.0.3
	github.com/stretchr/testify v1.4.0
	github.com/taskcluster/go-got v0.0.0-20190722003521-c63e3293a290
	github.com/taskcluster/slugid-go v1.1.0
	github.com/taskcluster/taskcluster-lib-urls v12.0.0+incompatible
	github.com/taskcluster/taskcluster/clients/client-go/v17 v17.0.0
	github.com/tent/hawk-go v0.0.0-20161026210932-d341ea318957
	golang.org/x/net v0.0.0-20190930134127-c5a3c61f89f3 // indirect
	golang.org/x/text v0.3.2 // indirect
	gopkg.in/check.v1 v1.0.0-20180628173108-788fd7840127 // indirect
	gopkg.in/tylerb/graceful.v1 v1.2.15
	gopkg.in/yaml.v2 v2.2.2
)

replace github.com/taskcluster/taskcluster/clients/client-go/v17 => ../client-go

// https://bugzilla.mozilla.org/show_bug.cgi?id=1580513
replace gopkg.in/yaml.v2 => github.com/go-yaml/yaml v0.0.0-20181115110504-51d6538a90f8

replace gopkg.in/check.v1 => github.com/go-check/check v1.0.0-20180628173108-788fd7840127

replace gopkg.in/tylerb/graceful.v1 => github.com/tylerb/graceful v1.2.15
