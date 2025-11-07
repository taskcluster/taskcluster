package task

import (
	"fmt"
	"io"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	tcclient "github.com/taskcluster/taskcluster/v93/clients/client-go"
	"github.com/taskcluster/taskcluster/v93/clients/client-shell/config"
)

// Executor represents the function interface of the task subcommand.
type Executor func(credentials *tcclient.Credentials, args []string, out io.Writer, flagSet *pflag.FlagSet) error

// getRunStatusString takes the state and resolved strings and crafts a printable summary string.
func getRunStatusString(state, resolved string) string {
	if resolved != "" {
		return fmt.Sprintf("%s '%s'", state, resolved)
	}

	return state
}

func executeHelperE(f Executor) func(*cobra.Command, []string) error {
	return func(cmd *cobra.Command, args []string) error {
		var creds *tcclient.Credentials
		if config.Credentials != nil {
			creds = config.Credentials.ToClientCredentials()
		}

		if len(args) < 1 {
			return fmt.Errorf("%s expects argument <taskId>", cmd.Name())
		}
		return f(creds, args, cmd.OutOrStdout(), cmd.Flags())
	}
}

func stringFlagHelper(flagset *pflag.FlagSet, flag string) string {
	val, err := flagset.GetString(flag)
	if err != nil {
		log.Panicf("could not get the value of %s: %v", flag, err)
	}
	return val
}
