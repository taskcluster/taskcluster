package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	// tcClient "github.com/petemoore/taskcluster-client.go/lib"
)

func loadJson(reader io.Reader) {
	var bytes []byte
	bytes, err = ioutil.ReadAll(reader)
	exitOnFail()
	var m map[string]interface{}
	err = json.Unmarshal(bytes, &m)
	exitOnFail()
	version := m["version"]
	title := m["title"]
	description := m["description"]
	baseURL := m["baseUrl"]
	entries := m["entries"]
	fmt.Printf("    version = '%v'\n", version)
	fmt.Printf("    title = '%v'\n", title)
	fmt.Printf("    description = '%v'\n", description)
	fmt.Printf("    baseURL = '%v'\n", baseURL)
	fmt.Printf("    entries type is %T\n", entries)
	e := entries.([]interface{})
	for _, entry := range e {
		Type := entry.(map[string]interface{})["type"]
		method := entry.(map[string]interface{})["method"]
		route := entry.(map[string]interface{})["route"]
		name := entry.(map[string]interface{})["name"]
		title := entry.(map[string]interface{})["title"]
		description := entry.(map[string]interface{})["description"]
		output := entry.(map[string]interface{})["output"]
		fmt.Printf("      entry type = '%v'\n", Type)
		fmt.Printf("      entry method = '%v'\n", method)
		fmt.Printf("      entry route = '%v'\n", route)
		fmt.Printf("      entry name = '%v'\n", name)
		fmt.Printf("      entry title = '%v'\n", title)
		fmt.Printf("      entry description = '%v'\n", description)
		fmt.Printf("      entry output = '%v'\n", output)
	}
}
