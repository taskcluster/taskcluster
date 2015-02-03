package main

import (
	"fmt"
	docopt "github.com/docopt/docopt-go"
	"github.com/petemoore/taskcluster-client-go/model"
	"github.com/petemoore/taskcluster-client-go/utils"
	"os"
)

var (
	err        error
	apis       []model.APIDefinition
	schemas    map[string]*model.JsonSubSchema = make(map[string]*model.JsonSubSchema)
	schemaURLs []string

	version = "generatemodel 1.0"
	usage   = `
generatemodel
generatemodel takes input from a json file describing a set of taskcluster APIs, and generates
go source files for inclusion in the (Go) TaskCluster Client API library. It is referenced by
go generate commands in the model package. See go generate --help and ../build.sh to see how
this is used by the build process for this taskcluster-client-go go project.

  Usage:
      generatemodel -f JSON-INPUT-FILE -o GO-OUTPUT-FILE -m MODEL-DATA-FILE
      generatemodel --help

  Options:
    -h --help             Display this help text.
    -f JSON-INPUT-FILE    Input file to read list of TaskCluster APIs from.
    -o GO-OUTPUT-FILE     File to store generated code in.
    -m MODEL-DATA-FILE    When all api descriptions have been downloaded and
                          parsed, and their dependencies have also been
                          processed, an overview of all the processed data
                          will be written to this file.
`
)

func main() {
	// Parse the docopt string and exit on any error or help message.
	arguments, err := docopt.Parse(usage, nil, true, version, false, true)

	apiFile, err := os.Open(arguments["-f"].(string))
	if err != nil {
		fmt.Printf("Could not load json file '%v'!\n", arguments["-f"].(string))
	}
	utils.ExitOnFail(err)
	apis, schemaURLs, schemas = model.LoadAPIs(apiFile)
	model.GenerateCode(arguments["-o"].(string), arguments["-m"].(string))
}
