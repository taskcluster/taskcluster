package generate_model

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	// tcClient "github.com/petemoore/taskcluster-client.go/lib"
)

func api() {
	var f map[string]interface{}
	bytes, err := ioutil.ReadFile("apis.json")
	if err != nil {
		fmt.Println(err)
	}
	err = json.Unmarshal(bytes, &f)
	if err != nil {
		fmt.Println(err)
	}
	for k, v := range f {
		m := v.(map[string]interface{})
		reference := m["reference"].(map[string]interface{})
		version := reference["version"]
		title := reference["title"]
		description := reference["description"]
		baseUrl := reference["baseUrl"]
		entries := reference["entries"]
		fmt.Printf("API: %v\n", k)
		fmt.Printf("  referenceUrl = '%v'\n", m["referenceUrl"])
		fmt.Printf("    version = '%v'\n", version)
		fmt.Printf("    title = '%v'\n", title)
		fmt.Printf("    description = '%v'\n", description)
		fmt.Printf("    baseUrl = '%v'\n", baseUrl)
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
}
