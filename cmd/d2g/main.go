package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/taskcluster/d2g"
	"github.com/taskcluster/d2g/dockerworker"
)

func main() {
	log.SetFlags(0)
	log.SetPrefix("d2g: ")
	var dwPayload dockerworker.DockerWorkerPayload
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	err := decoder.Decode(&dwPayload)
	if err != nil {
		log.Fatalf("Failed to convert input to a docker worker payload definition: %v", err)
	}
	gwPayload, err := d2g.Convert(&dwPayload)
	if err != nil {
		log.Fatal(err)
	}
	formattedActualGWPayload, err := json.MarshalIndent(*gwPayload, "", "  ")
	if err != nil {
		log.Fatalf("Cannot convert Generic Worker payload %#v to JSON: %s", *gwPayload, err)
	}
	fmt.Println(string(formattedActualGWPayload))
}
