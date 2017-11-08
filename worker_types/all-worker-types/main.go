package main

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"

	"github.com/taskcluster/taskcluster-client-go/awsprovisioner"
)

func main() {
	prov, err := awsprovisioner.New(nil)
	if err != nil {
		panic(err)
	}

	allWorkerTypes, err := prov.ListWorkerTypes()
	if err != nil {
		panic(err)
	}

	err = os.MkdirAll("worker_type_definitions", 0755)
	if err != nil {
		panic(err)
	}

	for _, wt := range *allWorkerTypes {
		resp, err := prov.WorkerType(wt)
		if err != nil {
			panic(err)
		}
		asJSON, err := json.MarshalIndent(resp, "", "  ")
		if err != nil {
			panic(err)
		}
		err = ioutil.WriteFile(filepath.Join("worker_type_definitions", wt), asJSON, 0644)
		if err != nil {
			panic(err)
		}
		log.Print(string(asJSON))
	}

	log.Print("All done.")
}
