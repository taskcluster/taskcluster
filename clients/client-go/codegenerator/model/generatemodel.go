// generatemodel is the command invoked by go generate in order to generate the go client library.

//go:build ignore

package main

import (
	"fmt"
	"log"
	"os"
	"regexp"

	docopt "github.com/docopt/docopt-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/codegenerator/model"
	"github.com/taskcluster/taskcluster/v96/tools/jsonschema2go"
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
      generatemodel -o GO-OUTPUT-DIR
      generatemodel --help

  Options:
    -h --help               Display this help text.
    -o GO-OUTPUT-DIR        Directory to place generated go packages.
`
)

func main() {
	// Parse the docopt string and exit on any error or help message.
	arguments, err := docopt.Parse(usage, nil, true, version, false, true)
	if err != nil {
		fmt.Fprintf(os.Stderr, "generatemodel: ERROR: Cannot parse arguments: %s\n", err)
		os.Exit(64)
	}

	err = model.StartReferencesServer()
	if err != nil {
		fmt.Fprintf(os.Stderr, "generatemodel: ERROR: Cannot load references: %s\n", err)
		os.Exit(64)
	}

	log.Print("Generating go types for code generator...")
	job := &jsonschema2go.Job{
		Package: "model",
		URLs: []string{
			model.ReferencesServerUrl("schemas/common/api-reference-v0.json"),
			model.ReferencesServerUrl("schemas/common/exchanges-reference-v0.json"),
			model.ReferencesServerUrl("schemas/common/manifest-v3.json"),
		},
		ExportTypes:          true,
		TypeNameBlacklist:    jsonschema2go.StringSet(map[string]bool{}),
		DisableNestedStructs: true,
	}
	result, err := job.Execute()
	if err != nil {
		log.Fatalf("Error generating go types for code generator: %v", err)
	}

	source := result.SourceCode
	source = regexp.MustCompile(`APIEntry struct`).ReplaceAll(source, []byte(`Entry struct`))
	source = regexp.MustCompile(`json\.RawMessage`).ReplaceAll(source, []byte(`*ScopeExpressionTemplate`))

	model.FormatSourceAndSave("types.go", source)

	log.Print("Loading APIs...")
	apiDefs := model.LoadAPIs()
	log.Print("Generating code...")
	apiDefs.GenerateCode(arguments["-o"].(string))
	log.Print("All done")
}
