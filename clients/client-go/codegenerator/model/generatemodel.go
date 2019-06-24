// generatemodel is the command invoked by go generate in order to generate the go client library.

// +build ignore

package main

import (
	"fmt"
	"log"
	"os"
	"regexp"

	docopt "github.com/docopt/docopt-go"
	"github.com/taskcluster/jsonschema2go"
	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go"
	"github.com/taskcluster/taskcluster/clients/client-go/codegenerator/model"
)

var (
	version = "generatemodel 1.0"
	usage   = `
generatemodel
generatemodel takes input from a json file describing a set of taskcluster APIs, and generates
go source files for inclusion in the (Go) Taskcluster Client API library. It is referenced by
go generate commands in the model package. See go generate --help and ../build.sh to see how
this is used by the build process for this taskcluster/clients/client-go go project.

  Usage:
      generatemodel -o GO-OUTPUT-DIR -m MODEL-DATA-FILE
      generatemodel --help

  Options:
    -h --help               Display this help text.
    -o GO-OUTPUT-DIR        Directory to place generated go packages.

Please note, you *must* set TASKCLUSTER_ROOT_URL to a valid taskcluster deployment to
retrieve the manifest/references/schemas from.
`
)

func main() {
	// Parse the docopt string and exit on any error or help message.
	arguments, err := docopt.Parse(usage, nil, true, version, false, true)
	if err != nil {
		fmt.Fprintf(os.Stderr, "generatemodel: ERROR: Cannot parse arguments: %s\n", err)
		os.Exit(64)
	}

	rootURL := tcclient.RootURLFromEnvVars()
	if rootURL == "" {
		log.Fatal("No TASKCLUSTER_ROOT_URL/TASKCLUSTER_PROXY_URL environment variable found to download manifest/references/schemas from.")
	}

	// echo "https://taskcluster-staging.net/schemas/common/api-reference-v0.json
	// https://taskcluster-staging.net/schemas/common/manifest-v3.json" | "${GOPATH}/bin/jsonschema2go" -o model | sed 's/^\([[:space:]]*\)API\(Entry struct\)/\1\2/' | sed 's/json\.RawMessage/ScopeExpressionTemplate/g' > codegenerator/model/types.go

	log.Print("Generating go types for code generator...")
	job := &jsonschema2go.Job{
		Package: "model",
		URLs: []string{
			tcurls.APIReferenceSchema(rootURL, "v0"),
			tcurls.ExchangesReferenceSchema(rootURL, "v0"),
			tcurls.APIManifestSchema(rootURL, "v3"),
		},
		ExportTypes:          true,
		TypeNameBlacklist:    jsonschema2go.StringSet(map[string]bool{}),
		DisableNestedStructs: true,
	}
	result, err := job.Execute()
	if err != nil {
		log.Fatalf("Error generating go types for code generator: %v", err)
	}

	source := regexp.MustCompile(`APIEntry struct`).ReplaceAll(result.SourceCode, []byte(`Entry struct`))
	source = regexp.MustCompile(`json\.RawMessage`).ReplaceAll(source, []byte(`ScopeExpressionTemplate`))

	model.FormatSourceAndSave("types.go", source)

	log.Print("Loading APIs...")
	apiDefs := model.LoadAPIs(rootURL)
	log.Print("Generating code...")
	apiDefs.GenerateCode(arguments["-o"].(string))
	log.Print("All done")
}
