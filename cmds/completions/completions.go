package completions

import (
	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster-cli/cmds/root"
)

var (
	defaultFilename = "bash_completion.sh"
)

func init() {
	// Add the task subtree to the root.
	use := "completions <filename (default:" + defaultFilename + ")>"
	completionsCommand := &cobra.Command{
		Short: "Provides bash completion script.",
		RunE:  genCompletion,
		Use:   use,
	}
	root.Command.AddCommand(completionsCommand)
}

func genCompletion(cmd *cobra.Command, args []string) error {
	filename := defaultFilename
	if len(args) != 0 {
		filename = args[0]
	}

	root.Command.GenBashCompletionFile(filename)
	return nil
}
