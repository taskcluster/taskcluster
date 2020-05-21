package configCmd

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"

	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster/v30/clients/client-shell/config"
)

func init() {
	cmd := &cobra.Command{
		Use:   "set <key> [<value>]",
		Short: "Set configuration <key> to <value>",
		RunE:  cmdSet,
	}
	cmd.Flags().BoolP("dry-run", "d", false, "Validate option only, don't set it")

	Command.AddCommand(cmd)
}

func cmdSet(cmd *cobra.Command, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("set requires argument <key>")
	}

	command, option, definition, value, err := getOptionFromKey(args[0])
	if err != nil {
		return err
	}

	var data string

	// read from command line, or from stdin
	if len(args) == 2 {
		data = args[1]
	} else {
		d, err := ioutil.ReadAll(os.Stdin)
		if err != nil {
			return fmt.Errorf("failed to read value from stdin, error: %s", err)
		}
		data = string(d)
	}

	// parse value if necessary
	if definition.Parse {
		err := json.Unmarshal([]byte(data), &value)
		if err != nil {
			return fmt.Errorf("failed to parse JSON value, error: %s", err)
		}
	} else {
		value = data
	}

	// Validate value
	if definition.Validate != nil {
		if err := definition.Validate(value); err != nil {
			return fmt.Errorf("invalid value, error: %s", err)
		}
	}

	// Save option
	if dry, _ := cmd.Flags().GetBool("dry-run"); !dry {
		config.Configuration[command][option] = value
		if err := config.Save(config.Configuration); err != nil {
			return fmt.Errorf("failed to save configuration file, error: %s", err)
		}
	}

	fmt.Fprintf(cmd.OutOrStdout(), "Set '%s.%s' = %s\n", command, option, data)

	return nil
}
