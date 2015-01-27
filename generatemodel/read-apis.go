package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	// tcClient "github.com/petemoore/taskcluster-client.go/lib"
)

var (
	err  error
	apis []APIDefinition
)

// APIDefinition represents the definition of a REST API, comprising of the URL to the defintion
// of the API in json format, together with a URL to a json schema to validate the definition
type APIDefinition struct {
	URL       string `json:"url"`
	SchemaURL string `json:"schema"`
	Data      APIModel
}

type APIModel interface {
	String() string
	postPopulate()
}

func main() {
	endpoints := flag.String("f", "", "the json file to load which defines all the api endpoints to parse")
	flag.Parse()
	if *endpoints == "" {
		log.Fatal("Please specify a json file to load the api endpoints from with -f option")
	}
	var bytes []byte
	bytes, err = ioutil.ReadFile(*endpoints)
	if err != nil {
		fmt.Printf("Could not load json file '%v'!\n", *endpoints)
	}
	exitOnFail()
	err = json.Unmarshal(bytes, &apis)
	exitOnFail()
	for i := range apis {
		fmt.Printf("Downloading API endpoint from %v...\n", apis[i].URL)
		var resp *http.Response
		resp, err = http.Get(apis[i].URL)
		exitOnFail()
		defer resp.Body.Close()
		fmt.Printf("Schema URL is %v\n", apis[i].SchemaURL)
		data := loadJson(resp.Body, &apis[i].SchemaURL)
		apis[i].Data = data
	}
	for _, api := range apis {
		fmt.Printf("Value: %v\n", api.Data)
	}
	fmt.Println("All done.")
}

func exitOnFail() {
	if err != nil {
		panic(err)
	}
}
