package configCmd

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster/v92/clients/client-shell/config"
)

func init() {
	Command.AddCommand(&cobra.Command{
		Use:   "help [<option>]",
		Short: "Get help for Taskcluster's configuration options.",
		RunE:  cmdHelp,
	})
}

func cmdHelp(cmd *cobra.Command, args []string) error {
	// default, print help for all commands
	if len(args) == 0 {
		printHelp(cmd)
		return nil
	}

	// otherwise, print for one specific option
	err := printOptionHelp(cmd, args[0])

	return err
}

// printOptionHelp shows help for specific option
func printOptionHelp(cmd *cobra.Command, key string) error {
	command, option, definition, value, err := getOptionFromKey(key)
	if err != nil {
		return err
	}

	defaultValue := definition.Default
	if definition.Parse {
		if s, err := json.MarshalIndent(defaultValue, "  ", "  "); err == nil {
			defaultValue = "\n" + string(s)
		} else {
			defaultValue = fmt.Sprintf("%#v", defaultValue)
		}
		if s, err := json.MarshalIndent(value, "  ", "  "); err == nil {
			value = "\n" + string(s)
		} else {
			value = fmt.Sprintf("%#v", value)
		}
	}

	fmt.Fprintf(cmd.OutOrStdout(), "Key:     %s.%s\n", command, option)
	fmt.Fprintln(cmd.OutOrStdout(), definition.Description)
	fmt.Fprintf(cmd.OutOrStdout(), "Value:   %s\n", value)
	fmt.Fprintf(cmd.OutOrStdout(), "Default: %s\n", defaultValue)

	return nil
}

// printHelp as a list of all possible configuration options
func printHelp(cmd *cobra.Command) {
	commands := []string{}
	maxLength := 0

	for command, options := range config.OptionsDefinitions {
		// this is for the list of commands
		commands = append(commands, command)

		// this is for the maximum name length for a key
		for option := range options {
			if len(command)+len(option) > maxLength {
				maxLength = len(command) + len(option)
			}
		}
	}

	sort.Strings(commands)

	fmt.Fprintln(cmd.OutOrStdout(), "Configuration options:")

	for _, command := range commands {
		options := config.OptionsDefinitions[command]

		for option, definition := range options {
			fmt.Fprintf(cmd.OutOrStdout(), "  %s  %s\n", pad(command+"."+option+":", maxLength+2), definition.Description)
		}

		// Add empty line between sections
		if len(options) > 0 {
			fmt.Fprint(cmd.OutOrStdout(), "\n")
		}
	}
}
