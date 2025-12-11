// Package validatejson impliments validate-json command
package validatejson

import (
	"errors"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster/v95/clients/client-shell/cmds/root"
	js "github.com/xeipuuv/gojsonschema"
)

var (
	Command = &cobra.Command{
		Use:   "validate-json <json-schema> <json-file>",
		Short: "Validate json file by provided json-schema",
		Args:  cobra.ExactArgs(2),
		RunE:  validate,
	}

	log = root.Logger
)

func init() {
	root.Command.AddCommand(Command)
}

// Takes json-schema & json as input which should be in the following 2 formats
// 1. https://community-tc.services.mozilla.com/references/schemas/<some-schema>.json
// 2. file:///home/user/<some-schema>.json
func validate(cmd *cobra.Command, args []string) error {
	schema := schemaLoader(args[0])
	document := schemaLoader(args[1])

	result, err := js.Validate(schema, document)

	if err != nil {
		return err
	}

	if result.Valid() {
		log.Info("The document is valid\n")
	} else {
		for _, desc := range result.Errors() {
			log.Infof("- %s\n", desc)
		}
		return errors.New("the document is not valid")
	}
	return nil
}

// In case user don't provide absolute path, it should be generate & return a JSONLoader
// Input: path to json schema
// Return: JSON loader interface
func schemaLoader(path string) js.JSONLoader {
	if strings.HasPrefix(path, "http") || strings.HasPrefix(path, "file://") {
		return js.NewReferenceLoader(path)
	} else if filepath.IsAbs(path) {
		path = "file://" + path
	} else if !filepath.IsAbs(path) {
		fullPath, err := filepath.Abs(path)
		if err != nil {
			log.Fatal(err)
		}
		path = "file://" + fullPath
	} else {
		log.Panic("Input isn't supported in the format")
	}
	return js.NewReferenceLoader(path)
}
