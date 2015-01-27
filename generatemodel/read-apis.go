package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"github.com/petemoore/taskcluster-client-go/model"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"strings"
)

var (
	err     error
	apis    []APIDefinition
	schemas map[string]*model.JsonSchemaTopLevel = make(map[string]*model.JsonSchemaTopLevel)
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
		data := loadJson(resp.Body, &apis[i].SchemaURL)
		apis[i].Data = data
	}
	fmt.Println("\n\n")
	for _, api := range apis {
		fmt.Println(api.URL)
		fmt.Println(strings.Repeat("=", len(api.URL)))
		fmt.Println(api.Data)
		fmt.Println()
	}
	for i, schema := range schemas {
		fmt.Println(i)
		fmt.Println(strings.Repeat("=", len(i)))
		fmt.Println(*schema)
		fmt.Println()
	}
	fmt.Println("All done.")
}

func exitOnFail() {
	if err != nil {
		panic(err)
	}
}

func loadJson(reader io.Reader, schema *string) APIModel {
	var bytes []byte
	bytes, err = ioutil.ReadAll(reader)
	exitOnFail()
	var m APIModel
	switch *schema {
	case "http://schemas.taskcluster.net/base/v1/api-reference.json":
		m = new(API)
	case "http://schemas.taskcluster.net/base/v1/exchanges-reference.json":
		m = new(Exchange)
	}
	err = json.Unmarshal(bytes, m)
	m.postPopulate()
	exitOnFail()
	return m
}
