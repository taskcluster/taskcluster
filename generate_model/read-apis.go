package generate_model

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	// tcClient "github.com/petemoore/taskcluster-client.go/lib"
)

type APIDefinition struct {
	Url    string
	Schema string
}

//go
func api_list() {
	var f []APIDefinition
	bytes, err := ioutil.ReadFile("apis.json")
	if err != nil {
		fmt.Println(err)
	}
	err = json.Unmarshal(bytes, &f)
	if err != nil {
		fmt.Println(err)
	}
}
