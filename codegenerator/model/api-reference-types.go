// api-reference-types is the command invoked by go generate in order to
// generate the go types formed from api-references.json, which are used
// inside the taskcluster client generation code itself.

// +build ignore

package main

import (
	"log"
	"os"

	tcurls "github.com/taskcluster/taskcluster-lib-urls"
)

func main() {
	if os.Getenv("TASKCLUSTER_ROOT_URL") == "" {
		log.Fatal("Please export TASKCLUSTER_ROOT_URL environment variable to target cluster to build api reference types from")
	}
	tcurls.APIReferenceSchema()
}
