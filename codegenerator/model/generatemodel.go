// generatemodel is the command invoked by go generate in order to generate the go client library.

// +build ignore

package main

import (
	"fmt"
	"os"
	"strconv"
	"time"

	docopt "github.com/docopt/docopt-go"
	"github.com/taskcluster/taskcluster-client-go/codegenerator/model"
)

var (
	version = "generatemodel 1.0"
	usage   = `
generatemodel
generatemodel takes input from a json file describing a set of taskcluster APIs, and generates
go source files for inclusion in the (Go) Taskcluster Client API library. It is referenced by
go generate commands in the model package. See go generate --help and ../build.sh to see how
this is used by the build process for this taskcluster-client-go go project.

  Usage:
      generatemodel -u API-MANIFEST -f SUPPLEMENTARY-DATA -o GO-OUTPUT-DIR -m MODEL-DATA-FILE
      generatemodel --help

  Options:
    -h --help               Display this help text.
    -u API-MANIFEST         The URL to retrieve the api manifest from, typically
                            http://references.taskcluster.net/manifest.json.
                            This lists the available APIs to generate, as a
                            json file containing a dictionary of api names to
                            json schema urls.
    -f SUPPLEMENTARY-DATA   Input file to read supplmentary information from
                            pertaining to the apis being generated. This
                            includes a base doc url for generating links to
                            in the generated go docs for each rest api method.
                            Typically the codegenerator/model/apis.json file.
    -o GO-OUTPUT-DIR        Directory to place generated go packages.
    -m MODEL-DATA-FILE      When all api descriptions have been downloaded and
                            parsed, and their dependencies have also been
                            processed, an overview of all the processed data
                            will be written to this file.
`
)

func main() {
	// Parse the docopt string and exit on any error or help message.
	arguments, err := docopt.Parse(usage, nil, true, version, false, true)
	if err != nil {
		fmt.Fprintf(os.Stderr, "generatemodel: ERROR: Cannot parse arguments: %s\n", err)
		os.Exit(64)
	}

	// allow time to be passed via env var UNIX_TIMESTAMP
	var downloadedTime time.Time
	switch t := os.Getenv("UNIX_TIMESTAMP"); t {
	case "":
		downloadedTime = time.Now()
	default:
		i, err := strconv.ParseInt(t, 10, 0)
		if err != nil {
			fmt.Printf("ERROR: Cannot convert UNIX_TIMESTAMP ('%s') to an int\n", t)
			os.Exit(65)
		}
		downloadedTime = time.Unix(i, 0)
	}

	apiDefs := model.LoadAPIs(arguments["-u"].(string), arguments["-f"].(string))
	model.GenerateCode(arguments["-o"].(string), arguments["-m"].(string), downloadedTime, apiDefs)
}
