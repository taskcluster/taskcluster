package d2g

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/mcuadros/go-defaults"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v96/clients/client-shell/cmds/root"
	"github.com/taskcluster/taskcluster/v96/clients/client-shell/config"
	"github.com/taskcluster/taskcluster/v96/tools/d2g"
	"github.com/taskcluster/taskcluster/v96/tools/d2g/dockerworker"
	"github.com/taskcluster/taskcluster/v96/tools/d2g/genericworker"
	"github.com/xeipuuv/gojsonschema"

	"github.com/spf13/cobra"
	"sigs.k8s.io/yaml"
)

func init() {
	cmd := &cobra.Command{
		Use: "d2g",
		Short: `Converts a docker-worker payload (JSON) to a generic-worker payload (JSON).
To convert a task definition (JSON), you must use the task definition flag (-t, --task-def).`,
		RunE: convert,
		Example: `  taskcluster d2g -t -f /path/to/input/task-definition.json
  cat /path/to/input/payload.json | taskcluster d2g
  cat /path/to/input/task-definition.json | taskcluster d2g -t
  echo '{"image": "ubuntu", "command": ["bash", "-c", "echo hello world"], "maxRunTime": 300}' | taskcluster d2g`,
	}
	cmd.Flags().StringP("file", "f", "", "Path to a .json file containing a docker-worker payload or task definition.")
	cmd.Flags().BoolP("task-def", "t", false, "Must use if the input is a docker-worker task definition.")
	root.Command.AddCommand(cmd)
}

func convert(cmd *cobra.Command, args []string) (err error) {
	isTaskDef, _ := cmd.Flags().GetBool("task-def")
	filePath, _ := cmd.Flags().GetString("file")
	// Default file extension is json(temporary, handled for piped input)
	fileExtension := "json"

	// Read file extension(temporary, handled for piped input)
	if len(filePath) >= 4 {
		fileExtension = filePath[len(filePath)-4:]
	}
	input, err := userInput(filePath, fileExtension)
	if err != nil {
		return err
	}

	var dwTaskDef map[string]any
	var inputPayload json.RawMessage
	if isTaskDef {
		err = json.Unmarshal(input, &dwTaskDef)
		if err != nil {
			return fmt.Errorf("failed to unmarshal task definition input to a docker worker task definition: %v", err)
		}
		if _, exists := dwTaskDef["payload"]; !exists {
			return fmt.Errorf("task definition input does not contain a payload")
		}

		inputPayload, err = json.Marshal(dwTaskDef["payload"])
		if err != nil {
			return fmt.Errorf("failed to marshal docker worker payload: %v", err)
		}
	} else {
		inputPayload = input
	}

	// Validate the JSON input against the schema
	err = validateJSON(inputPayload, dockerworker.JSONSchema())
	if err != nil {
		return fmt.Errorf("input validation failed: %v", err)
	}

	// Convert the validated JSON input
	dwPayload := new(dockerworker.DockerWorkerPayload)
	defaults.SetDefaults(dwPayload)
	err = json.Unmarshal(inputPayload, &dwPayload)
	if err != nil {
		return fmt.Errorf("failed to convert input to a docker worker payload definition: %v", err)
	}

	d2gConfig := d2g.Config{
		EnableD2G:             true,
		AllowChainOfTrust:     true,
		AllowDisableSeccomp:   true,
		AllowGPUs:             false,
		AllowHostSharedMemory: true,
		AllowInteractive:      true,
		AllowKVM:              true,
		AllowLoopbackAudio:    true,
		AllowLoopbackVideo:    true,
		AllowPrivileged:       true,
		AllowPtrace:           true,
		AllowTaskclusterProxy: true,
		GPUs:                  "all",
		LogTranslation:        true,
	}

	if isTaskDef {
		dwTaskDefJSON, err := json.Marshal(dwTaskDef)
		if err != nil {
			return fmt.Errorf("failed to marshal docker worker task definition: %v", err)
		}

		var creds *tcclient.Credentials
		if config.Credentials != nil {
			creds = config.Credentials.ToClientCredentials()
		}
		auth := tcauth.New(creds, config.RootURL())

		// Convert dwTaskDef to gwTaskDef
		gwTaskDefJSON, err := d2g.ConvertTaskDefinition(dwTaskDefJSON, d2gConfig, auth, os.ReadDir)
		if err != nil {
			return fmt.Errorf("failed to convert docker worker task definition to a generic worker task definition: %v", err)
		}

		// Validate the JSON output against the schema
		var gwTaskDef map[string]any
		err = json.Unmarshal(gwTaskDefJSON, &gwTaskDef)
		if err != nil {
			return fmt.Errorf("failed to unmarshal generic worker task definition: %v", err)
		}

		gwPayload, err := json.Marshal(gwTaskDef["payload"])
		if err != nil {
			return fmt.Errorf("failed to marshal generic worker payload: %v", err)
		}
		err = validateJSON(gwPayload, genericworker.JSONSchema())
		if err != nil {
			return fmt.Errorf("output validation failed: %v", err)
		}

		// Convert to original extension given by user
		if isYAMLExtension(fileExtension) {
			gwPayload, err = yaml.JSONToYAML(gwPayload)
			if err != nil {
				return fmt.Errorf("failed to convert from JSON To YAML: %v", err)
			}
		}
		fmt.Fprintln(cmd.OutOrStdout(), string(gwPayload))
	} else {
		// Convert dwPayload to gwPayload
		gwPayload, _, err := d2g.ConvertPayload(dwPayload, d2gConfig, os.ReadDir)
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

		// Convert to original extension given by user
		if isYAMLExtension(fileExtension) {
			formattedActualGWPayload, err = yaml.JSONToYAML(formattedActualGWPayload)
			if err != nil {
				return fmt.Errorf("failed to convert from JSON To YAML: %v", err)
			}
		}
		fmt.Fprintln(cmd.OutOrStdout(), string(formattedActualGWPayload))
	}

	return nil
}

func userInput(filePath string, fileExtension string) (input json.RawMessage, err error) {
	if filePath != "" {
		// Read input from file
		input, err = os.ReadFile(filePath)
		// Check if input is in yaml, then convert to json
		if isYAMLExtension(fileExtension) {
			input, err = yaml.YAMLToJSON(input)
			if err != nil {
				return nil, fmt.Errorf("failed to convert YAML To JSON: %v", err)
			}
		}
		if err != nil {
			return nil, fmt.Errorf("failed to read input file: %v", err)
		}
	} else {
		// Check if input is piped
		stat, _ := os.Stdin.Stat()
		if (stat.Mode() & os.ModeCharDevice) == 0 {
			// Read input from pipe
			input, err = io.ReadAll(os.Stdin)
			if err != nil {
				return nil, fmt.Errorf("failed to read input: %v", err)
			}
		} else {
			return nil, fmt.Errorf("no input provided")
		}
	}

	return
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

func isYAMLExtension(fileExtension string) bool {
	fileExtensionLower := strings.ToLower(fileExtension)
	return fileExtensionLower == "yaml" || fileExtensionLower == ".yml"
}
