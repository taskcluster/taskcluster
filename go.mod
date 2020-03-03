module github.com/taskcluster/taskcluster/v25

go 1.13

require (
	github.com/Flaque/filet v0.0.0-20190209224823-fc4d33cfcf93
	github.com/Microsoft/go-winio v0.4.14
	github.com/aws/aws-sdk-go v1.28.9
	github.com/certifi/gocertifi v0.0.0-20200104152315-a6d78f326758 // indirect
	github.com/dchest/uniuri v0.0.0-20160212164326-8902c56451e9
	github.com/dgrijalva/jwt-go v3.2.0+incompatible
	github.com/docopt/docopt-go v0.0.0-20180111231733-ee0de3bc6815
	github.com/dsnet/compress v0.0.1 // indirect
	github.com/elastic/go-sysinfo v1.3.0
	github.com/fatih/camelcase v1.0.0
	github.com/frankban/quicktest v1.7.2 // indirect
	github.com/getsentry/raven-go v0.2.0
	github.com/ghodss/yaml v1.0.0
	github.com/golang/snappy v0.0.1 // indirect
	github.com/gorilla/websocket v1.4.1
	github.com/iancoleman/strcase v0.0.0-20191112232945-16388991a334
	github.com/kr/text v0.1.0
	github.com/mholt/archiver v2.1.0+incompatible
	github.com/mitchellh/go-homedir v1.1.0
	github.com/nwaples/rardecode v1.0.0 // indirect
	github.com/pborman/uuid v1.2.0
	github.com/peterbourgon/mergemap v0.0.0-20130613134717-e21c03b7a721
	github.com/pierrec/lz4 v2.4.1+incompatible // indirect
	github.com/pkg/browser v0.0.0-20180916011732-0a3d74bf9ce4
	github.com/sirupsen/logrus v1.4.1
	github.com/spf13/cobra v0.0.5
	github.com/spf13/pflag v1.0.5
	github.com/streadway/amqp v0.0.0-20190827072141-edfb9018d271
	github.com/stretchr/testify v1.4.0
	github.com/taskcluster/go-got v0.0.0-20190401132811-c63e3293a290
	github.com/taskcluster/httpbackoff/v3 v3.0.0
	github.com/taskcluster/pulse-go v1.0.0
	github.com/taskcluster/shell v0.0.0-20191115171910-c688067f12d3
	github.com/taskcluster/slugid-go v1.1.0
	github.com/taskcluster/stateless-dns-go v1.0.6
	github.com/taskcluster/taskcluster-lib-urls v13.0.0+incompatible
	github.com/taskcluster/websocktunnel v2.0.0+incompatible
	github.com/tent/hawk-go v0.0.0-20161026210932-d341ea318957
	github.com/xeipuuv/gojsonpointer v0.0.0-20190905194746-02993c407bfb // indirect
	github.com/xeipuuv/gojsonreference v0.0.0-20180127040603-bd5ef7bd5415 // indirect
	github.com/xeipuuv/gojsonschema v1.1.0
	golang.org/x/crypto v0.0.0-20191011191535-87dc89f01550
	golang.org/x/net v0.0.0-20191002035440-2ec189313ef0
	golang.org/x/sys v0.0.0-20191218084908-4a24b4065292
	golang.org/x/tools v0.0.0-20200219161401-5fb17a1e7b9b
	gopkg.in/tylerb/graceful.v1 v1.2.15
	gopkg.in/yaml.v2 v2.2.2
	gopkg.in/yaml.v3 v3.0.0-20190502103701-55513cacd4ae
	launchpad.net/gocheck v0.0.0-20140225173054-000000000087 // indirect
)

// https://bugzilla.mozilla.org/show_bug.cgi?id=1580513
replace gopkg.in/yaml.v2 => github.com/go-yaml/yaml v0.0.0-20181115110504-51d6538a90f8

replace gopkg.in/check.v1 => github.com/go-check/check v0.0.0-20190902080502-41f04d3bba15
