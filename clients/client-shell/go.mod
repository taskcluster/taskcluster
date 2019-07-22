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
	github.com/stretchr/testify v1.3.0
	github.com/taskcluster/go-got v0.0.0-20190124144129-fcbc014b2883
	github.com/taskcluster/slugid-go v1.1.0
	github.com/taskcluster/taskcluster-lib-urls v12.0.0+incompatible
	github.com/taskcluster/taskcluster/clients/client-go/v14 v14.0.0-20190713182157-1b8e18d76d60
	github.com/tent/hawk-go v0.0.0-20161026210932-d341ea318957
	golang.org/x/net v0.0.0-20190628185345-da137c7871d7 // indirect
	golang.org/x/text v0.3.2 // indirect
	gopkg.in/check.v1 v1.0.0-20180628173108-788fd7840127 // indirect
	gopkg.in/tylerb/graceful.v1 v1.2.15
	gopkg.in/yaml.v2 v2.2.2
)

replace github.com/taskcluster/taskcluster/clients/client-go/v14 => ../client-go
