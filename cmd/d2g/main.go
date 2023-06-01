package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/d2g"
	"github.com/taskcluster/d2g/dockerworker"
	"github.com/xeipuuv/gojsonschema"
)

func main() {
	log.SetFlags(0)
	log.SetPrefix("d2g: ")

	// Read the JSON input from standard input
	input, err := io.ReadAll(os.Stdin)
	if err != nil {
		log.Fatal("Failed to read input:", err)
	}

	// Define the path to the JSON schema
	rootURL := os.Getenv("TASKCLUSTER_ROOT_URL")
	if rootURL == "" {
		log.Fatal("TASKCLUSTER_ROOT_URL environment variable is not set")
	}
	u, err := url.Parse(rootURL)
	if err != nil {
		log.Fatalf("Failed to parse TASKCLUSTER_ROOT_URL: %v", err)
	}
	u.Path = path.Join(u.Path, "schemas/docker-worker/v1/payload.json")
	schemaURL := u.String()

	// Validate the JSON input against the schema
	err = validateJSON(schemaURL, input)
	if err != nil {
		log.Fatalf("Input validation failed: %v", err)
	}

	// Convert the validated JSON input
	dwPayload := new(dockerworker.DockerWorkerPayload)
	defaults.SetDefaults(dwPayload)
	err = json.Unmarshal(input, &dwPayload)
	if err != nil {
		log.Fatalf("Failed to convert input to a docker worker payload definition: %v", err)
	}

	gwPayload, err := d2g.Convert(dwPayload)
	if err != nil {
		log.Fatal(err)
	}

	formattedActualGWPayload, err := json.MarshalIndent(*gwPayload, "", "  ")
	if err != nil {
		log.Fatalf("Cannot convert Generic Worker payload %#v to JSON: %s", *gwPayload, err)
	}

	fmt.Println(string(formattedActualGWPayload))
}

func validateJSON(schemaURL string, input []byte) error {
	// Fetch the JSON schema from the URL
	response, err := http.Get(schemaURL)
	if err != nil {
		return fmt.Errorf("failed to fetch JSON schema: %v", err)
	}
	defer response.Body.Close()

	// Read the schema from the response body
	schemaBytes, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("failed to read JSON schema: %v", err)
	}

	// Parse the JSON schema
	schemaLoader := gojsonschema.NewBytesLoader(schemaBytes)
	documentLoader := gojsonschema.NewBytesLoader(input)

	// Perform the validation
	result, err := gojsonschema.Validate(schemaLoader, documentLoader)
	if err != nil {
		return err
	}

	// Check if the validation failed
	if !result.Valid() {
		// Collect validation errors
		var errors []string
		for _, desc := range result.Errors() {
			errors = append(errors, desc.String())
		}

		// Return the validation errors as an error message
		return fmt.Errorf("validation failed:\n%s", strings.Join(errors, "\n"))
	}

	return nil
}
