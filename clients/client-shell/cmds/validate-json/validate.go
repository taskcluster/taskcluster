// package validateJson impliments validate-json command
package validateJson

import (
	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster/v29/clients/client-shell/cmds/root"
	js "github.com/xeipuuv/gojsonschema"
)

var (
	Command = &cobra.Command{
		Use:   "validate-json <json-schema> <json-file>",
		Short: "Validate json file by provided json-schema",
		Run:   validate,
	}

	log = root.Logger
)

func init() {
	root.Command.AddCommand(Command)
}

func validate(cmd *cobra.Command, args []string) {
	schemaLoader := js.NewReferenceLoader(args[0])
	documentLoader := js.NewReferenceLoader(args[1])

	result, err := js.Validate(schemaLoader, documentLoader)

	if err != nil {
		log.Panic(err.Error())
	}

	if result.Valid() {
		log.Info("The document is valid\n")
	} else {
		log.Info("The document is not valid. see errors :\n")
		for _, desc := range result.Errors() {
			log.Infof("- %s\n", desc)
		}
	}
}
