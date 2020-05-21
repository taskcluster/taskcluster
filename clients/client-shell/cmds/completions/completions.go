// Package completions implements command completion support.
package completions

import (
	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster/v30/clients/client-shell/cmds/root"
)

var (
	defaultFilename = "bash_completion.sh"
)

func init() {
	// Add the task subtree to the root.
	use := "completions <filename (default:" + defaultFilename + ")>"
	completionsCommand := &cobra.Command{
		Short: "Provides bash completion script.",
		Long: `Writes a bash completion script to the path specified, or the default filename if not given.

To use, do one of the following:
'source bash_completion.sh' to add to your current shell,
Add 'source bash_completion.sh' to your bash login scripts
On Linux you can also copy it to /etc/bash_completion.d/ so that future bash shells have it active.
        `,
		RunE: genCompletion,
		Use:  use,
	}
	root.Command.AddCommand(completionsCommand)
}

func genCompletion(cmd *cobra.Command, args []string) error {
	filename := defaultFilename
	if len(args) != 0 {
		filename = args[0]
	}

	return root.Command.GenBashCompletionFile(filename)
}
