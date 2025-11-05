// Package completions implements command completion support.
package completions

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster/v92/clients/client-shell/cmds/root"
)

var (
	defaultFilename = "completion.sh"
)

func init() {
	// Add the task subtree to the root.
	use := "completions shell [filename (default:" + defaultFilename + ")]"
	completionsCommand := &cobra.Command{
		Short: "Provides completion script for the specified shell.",
		Long: `Writes a completion script for the specified shell to the path specified, or the default filename if not given.

The following is a couple of example usages for bash:
'source bash_completion.sh' to add to your current shell,
Add 'source bash_completion.sh' to your bash login scripts
On Linux you can also copy it to /etc/bash_completion.d/ so that future bash shells have it active.
        `,
		Use: use,
	}
	root.Command.AddCommand(completionsCommand)

	shortDesc := "Generate the autocompletion script for %s"
	usage := "%s [filename]"

	bash := &cobra.Command{
		Args:  cobra.MaximumNArgs(1),
		RunE:  genCompletion("bash"),
		Short: fmt.Sprintf(shortDesc, "bash"),
		Use:   fmt.Sprintf(usage, "bash"),
	}

	fish := &cobra.Command{
		Args:  cobra.MaximumNArgs(1),
		RunE:  genCompletion("fish"),
		Short: fmt.Sprintf(shortDesc, "fish"),
		Use:   fmt.Sprintf(usage, "fish"),
	}

	powershell := &cobra.Command{
		Args:  cobra.MaximumNArgs(1),
		RunE:  genCompletion("powershell"),
		Short: fmt.Sprintf(shortDesc, "powershell"),
		Use:   fmt.Sprintf(usage, "powershell"),
	}

	zsh := &cobra.Command{
		Args:  cobra.MaximumNArgs(1),
		RunE:  genCompletion("zsh"),
		Short: fmt.Sprintf(shortDesc, "zsh"),
		Use:   fmt.Sprintf(usage, "zsh"),
	}

	completionsCommand.AddCommand(bash, fish, powershell, zsh)
}

func genCompletion(shell string) func(*cobra.Command, []string) error {
	return func(cmd *cobra.Command, args []string) error {
		filename := fmt.Sprintf("%s_%s", shell, defaultFilename)
		if len(args) > 0 {
			filename = args[0]
		}

		switch shell {
		case "bash":
			return root.Command.GenBashCompletionFile(filename)
		case "fish":
			return root.Command.GenFishCompletionFile(filename, false)
		case "powershell":
			return root.Command.GenPowerShellCompletionFile(filename)
		case "zsh":
			return root.Command.GenZshCompletionFile(filename)
		}

		return nil
	}
}
