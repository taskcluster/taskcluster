package group

import (
	"fmt"
	"io"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	tcclient "github.com/taskcluster/taskcluster/v30/clients/client-go"
	"github.com/taskcluster/taskcluster/v30/clients/client-shell/config"
)

// Executor represents the function interface of the task subcommand.
type Executor func(credentials *tcclient.Credentials, args []string, out io.Writer, flagSet *pflag.FlagSet) error

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
