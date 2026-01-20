// Package configCmd implements the config subcommands.
package configCmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-shell/cmds/root"
	"github.com/taskcluster/taskcluster/v96/clients/client-shell/config"
)

var (
	// Command holds the `taskcluster config` command definition
	// we attach `taskcluster config [...]` subcommands on it
	Command = &cobra.Command{
		Use:   "config",
		Short: "Get/set taskcluster shell client configuration options.",
		RunE:  cmdConfig,
	}
)

func init() {
	// set flags
	Command.Flags().StringP("output", "o", "", "Write output to file [default: -]")
	Command.Flags().StringP("format", "f", "yaml", "Select output format [default: yaml]")

	// register
	root.Command.AddCommand(Command)

	// register config options for this command
	config.RegisterOptions("config", map[string]config.OptionDefinition{
		"rootUrl": config.OptionDefinition{
			Description: "Root URL of the Taskcluster deployment",
			Default:     "",
			Env:         "TASKCLUSTER_ROOT_URL",
			Validate:    isString,
		},
		"clientId": config.OptionDefinition{
			Description: "ClientId to be used for authenticating requests",
			Default:     "",
			Env:         "TASKCLUSTER_CLIENT_ID",
			Validate:    isString,
		},
		"accessToken": config.OptionDefinition{
			Description: "AccessToken to be used for authenticating requests",
			Default:     "",
			Env:         "TASKCLUSTER_ACCESS_TOKEN",
			Validate:    isString,
		},
		"certificate": config.OptionDefinition{
			Description: "Certificate as required if using temporary credentials (must be given as string).",
			Default:     nil,
			Env:         "TASKCLUSTER_CERTIFICATE",
			Validate: func(value any) error {
				s, ok := value.(string)
				if !ok {
					return errors.New("must be a string containing certificate in JSON")
				}
				var cert tcclient.Certificate
				if err := json.Unmarshal([]byte(s), &cert); err != nil {
					return fmt.Errorf("failed to parse JSON string, error: %s", err)
				}
				return nil
			},
		},
		"authorizedScopes": config.OptionDefinition{
			Description: `Set of scopes to be used for authorizing requests, defaults to all the scopes you have.`,
			Parse:       true,
			Validate: func(value any) error {
				strs, ok := value.([]any)
				if ok {
					for _, str := range strs {
						if _, ok2 := str.(string); !ok2 {
							ok = false
							break
						}
					}
				}
				if !ok {
					return errors.New("must be a list of strings")
				}
				return nil
			},
		},
	}) // end RegisterOptions
}

func cmdConfig(cmd *cobra.Command, args []string) error {
	// redirect single-value cases to 'config get <key>'
	// get supports the exact same flags so no big deal
	if len(args) > 0 {
		return cmdGet(cmd, args)
	}

	// select formatter
	var formatter func(any) []byte
	format, _ := cmd.Flags().GetString("format")

	switch format {
	case "yaml":
		formatter = formatYAML
	case "json":
		formatter = formatJSON
	default:
		return fmt.Errorf("unsupported output format '%s'", format)
	}

	// set output to file if necessary
	if output, _ := cmd.Flags().GetString("output"); len(output) != 0 {
		file, err := os.Create(output)
		if err != nil {
			return fmt.Errorf("failed to create output file '%s', error: %s", output, err)
		}
		defer file.Close()
		cmd.SetOut(file)
		cmd.SetErr(file)
	}

	// write output
	if _, err := cmd.OutOrStdout().Write(formatter(config.Configuration)); err != nil {
		return fmt.Errorf("error writing result, error: %s", err)
	}

	return nil
}
