package codegenerator

import (
	"encoding/json"
	"github.com/taskcluster/taskcluster-client-go/codegenerator/model"
	"os"
)

func Generate() {
	file, err := os.Open("schema.json")
	decoder := json.NewDecoder(file)
	defer file.Close()
	m := new(JsonSubSchema)
	err = decoder.Decode(m)
	utils.ExitOnFail(err)
	m.postPopulate(apiDef)
}
