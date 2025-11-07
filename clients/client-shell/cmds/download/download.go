package download

import (
	"github.com/taskcluster/taskcluster/v93/clients/client-shell/cmds/root"

	"github.com/spf13/cobra"
)

var (
	downloadCmd = &cobra.Command{
		Use:   "download",
		Short: "Provides support for downloading data.",
	}
)

func init() {
	root.Command.AddCommand(downloadCmd)
}
