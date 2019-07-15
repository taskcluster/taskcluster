package configCmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

func init() {
	cmd := &cobra.Command{
		Use:   "get <key>",
		Short: "Get the current value of a configuration option",
		RunE:  cmdGet,
	}
	cmd.Flags().StringP("output", "o", "", "Write output to file [default: -]")
	cmd.Flags().StringP("format", "f", "yaml", "Select output format [default: yaml]")

	Command.AddCommand(cmd)
}

func cmdGet(cmd *cobra.Command, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("get requires argument <key>")
	}

	// select formatter
	var formatter func(interface{}) []byte
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
		cmd.SetOutput(file)
	}

	// retrieve value
	_, _, _, value, err := getOptionFromKey(args[0])
	if err != nil {
		return err
	}

	// write output
	if _, err := cmd.OutOrStdout().Write(formatter(value)); err != nil {
		return fmt.Errorf("error writing result, error: %s", err)
	}

	return nil
}
