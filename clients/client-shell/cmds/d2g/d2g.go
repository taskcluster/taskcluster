package d2g

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v54/clients/client-shell/cmds/root"
	"github.com/taskcluster/taskcluster/v54/tools/d2g"
	"github.com/taskcluster/taskcluster/v54/tools/d2g/dockerworker"
	"github.com/taskcluster/taskcluster/v54/tools/d2g/genericworker"
	"github.com/xeipuuv/gojsonschema"

	"github.com/spf13/cobra"
)

func init() {
	cmd := &cobra.Command{
		Use:   "d2g",
		Short: "Converts a docker-worker payload (JSON) to a generic-worker payload (JSON).",
		RunE:  convert,
	}
	cmd.Flags().StringP("file", "f", "", "Path to a .json file containing a docker-worker payload.")
	root.Command.AddCommand(cmd)
}

func convert(cmd *cobra.Command, args []string) (err error) {
	var input []byte

	filePath, _ := cmd.Flags().GetString("file")
	if filePath != "" {
		// Read input from file
		input, err = os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to read input file: %v", err)
		}
	} else {
		// Check if input is piped
		stat, _ := os.Stdin.Stat()
		if (stat.Mode() & os.ModeCharDevice) == 0 {
			// Read input from pipe
			input, err = io.ReadAll(os.Stdin)
			if err != nil {
				return fmt.Errorf("failed to read input: %v", err)
			}
		} else {
			return fmt.Errorf("no input provided")
		}
	}

	// Validate the JSON input against the schema
	err = validateJSON(input, dockerworker.JSONSchema())
	if err != nil {
		return fmt.Errorf("input validation failed: %v", err)
	}

	// Convert the validated JSON input
	dwPayload := new(dockerworker.DockerWorkerPayload)
	defaults.SetDefaults(dwPayload)
	err = json.Unmarshal(input, &dwPayload)
	if err != nil {
		return fmt.Errorf("failed to convert input to a docker worker payload definition: %v", err)
	}

	// Convert dwPayload to gwPayload
	gwPayload, err := d2g.Convert(dwPayload)
	if err != nil {
		return fmt.Errorf("conversion error: %v", err)
	}

	// Convert gwPayload to JSON
	formattedActualGWPayload, err := json.MarshalIndent(*gwPayload, "", "  ")
	if err != nil {
		return fmt.Errorf("cannot convert Generic Worker payload %#v to JSON: %s", *gwPayload, err)
	}

	// Validate the JSON output against the schema
	err = validateJSON(formattedActualGWPayload, genericworker.JSONSchema())
	if err != nil {
		return fmt.Errorf("output validation failed: %v", err)
	}

	fmt.Fprintln(cmd.OutOrStdout(), string(formattedActualGWPayload))

	return nil
}

func validateJSON(input []byte, schema string) error {
	// Parse the JSON schema
	schemaLoader := gojsonschema.NewStringLoader(schema)
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
