package main

import (
	"io/ioutil"
	"log"
	"net/url"
	"os"
	"path/filepath"

	"github.com/taskcluster/taskcluster-base-go/jsontest"
	tcclient "github.com/taskcluster/taskcluster-client-go"
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
		cd := tcclient.Client(*prov)
		cs, err := (&cd).Request(nil, "GET", "/worker-type/"+url.QueryEscape(wt), nil)
		if err != nil {
			panic(err)
		}
		formattedData, err := jsontest.FormatJson([]byte(cs.HTTPResponseBody))
		if err != nil {
			panic(err)
		}
		err = ioutil.WriteFile(filepath.Join("worker_type_definitions", wt), formattedData, 0644)
		if err != nil {
			panic(err)
		}
		log.Print(string(formattedData))
	}

	log.Print("All done.")
}
