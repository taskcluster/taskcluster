package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	// tcClient "github.com/petemoore/taskcluster-client.go/lib"
)

type topLevel struct {
	referenceUrl string
	reference    interface{}
}

func (t topLevel) String() string {
	return fmt.Sprintf("referenceUrl: '%v', reference: '%v'", t.referenceUrl, t.reference)
}

func main() {
	var f map[string]topLevel = make(map[string]topLevel)
	bytes, err := ioutil.ReadFile("apis.json")
	if err != nil {
		fmt.Println(err)
	}
	err = json.Unmarshal(bytes, &f)
	if err != nil {
		fmt.Println(err)
	}
	for k, v := range f {
		fmt.Printf("%v = '%v'\n", k, v)
	}
}
