package main

import (
	"fmt"
	docopt "github.com/docopt/docopt-go"
	"github.com/petemoore/taskcluster-client-go/model"
	"github.com/petemoore/taskcluster-client-go/utils"
	"io/ioutil"
)

var (
	err     error
	apis    []model.APIDefinition
	schemas map[string]*model.JsonSchemaTopLevel = make(map[string]*model.JsonSchemaTopLevel)

	version = "generatemodel 1.0"
	usage   = `
generatemodel
generatemodel takes input from a json file describing a set of taskcluster APIs, and generates
go source files for inclusion in the (Go) TaskCluster Client API library. It is referenced by
go generate commands in the model package. See go generate --help and ../build.sh to see how
this is used by the build process for this taskcluster-client-go go project.

  Usage:
      generatemodel -f JSON-INPUT-FILE -o GO-OUTPUT-FILE
      generatemodel --help

  Options:
    -h --help             Display this help text.
    -f JSON-INPUT-FILE    Input file to read list of TaskCluster APIs from.
    -o GO-OUTPUT-FILE     File to store generated code in.
`
)

func main() {
	// Parse the docopt string and exit on any error or help message.
	arguments, err := docopt.Parse(usage, nil, true, version, false, true)

	var bytes []byte
	bytes, err = ioutil.ReadFile(arguments["-f"].(string))
	if err != nil {
		fmt.Printf("Could not load json file '%v'!\n", arguments["-f"].(string))
	}
	utils.ExitOnFail(err)
	apis, schemas = model.LoadAPIs(bytes)
	//printAllData()
	model.GenerateCode(arguments["-o"].(string))
}

func printAllData() {
	for _, api := range apis {
		fmt.Print(utils.Underline(api.URL))
		fmt.Println(api.Data)
		fmt.Println()
	}
	for i, schema := range schemas {
		fmt.Print(utils.Underline(i))
		fmt.Println(*schema)
		fmt.Println()
	}
}
