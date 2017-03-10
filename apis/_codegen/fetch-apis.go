package main

import (
	"io/ioutil"
	"log"

	"github.com/taskcluster/taskcluster-cli/apis"
)

func main() {
	source, err := apis.GenerateServices("http://references.taskcluster.net/manifest.json", "services", "schemas")
	if err != nil {
		log.Fatalln("error: go fmt, code generation failed: ", err)
	}

	if err := ioutil.WriteFile("services.go", source, 0664); err != nil {
		log.Fatalln("error: failed to save services.go: ", err)
	}
}
