package configCmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster/v94/clients/client-shell/config"
)

func init() {
	cmd := &cobra.Command{
		Use:   "reset [<key> | --all]",
		Short: "Reset one or all configuration options",
		RunE:  cmdReset,
	}
	cmd.Flags().BoolP("all", "a", false, "Reset all options.")

	Command.AddCommand(cmd)
}

func cmdReset(cmd *cobra.Command, args []string) error {
	// reset all
	if all, _ := cmd.Flags().GetBool("all"); all {
		for command, options := range config.OptionsDefinitions {
			for option, definition := range options {
				config.Configuration[command][option] = definition.Default
				fmt.Fprintf(cmd.OutOrStdout(), "Reset %s.%s to default value.\n", command, option)
			}
		}
	} else { // or reset one specific option
		if len(args) == 0 {
			return fmt.Errorf("reset requires argument <key> or flag --all to be set")
		}

		command, option, definition, _, err := getOptionFromKey(args[0])
		if err != nil {
			return err
		}

		config.Configuration[command][option] = definition.Default
		fmt.Fprintf(cmd.OutOrStdout(), "Reset %s.%s to default value.\n", command, option)
	}

	// Save configuration
	if err := config.Save(config.Configuration); err != nil {
		return fmt.Errorf("failed to save configuration file, error: %s", err)
	}

	return nil
}
