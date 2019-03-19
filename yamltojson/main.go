package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"

	"github.com/ghodss/yaml"
)

func main() {
	yml, err := ioutil.ReadAll(os.Stdin)
	if err != nil {
		log.Fatalf("Could not read from standard in: %v", err)
	}
	jsn, err := yaml.YAMLToJSON(yml)
	if err != nil {
		log.Fatalf("Could not convert to yaml: %v", err)
	}
	formatted, err := FormatJSON(jsn)
	if err != nil {
		log.Fatalf("Could not format valid json: %v", err)
	}
	fmt.Println(string(formatted))
}

// FormatJSON takes json []byte input, unmarshals and then marshals, in order to get a
// canonical representation of json (i.e. formatted with objects ordered).
// Ugly and perhaps inefficient, but effective! :p
func FormatJSON(a []byte) ([]byte, error) {
	tmpObj := new(interface{})
	err := json.Unmarshal(a, &tmpObj)
	if err != nil {
		return a, err
	}
	return json.MarshalIndent(&tmpObj, "", "  ")
}
