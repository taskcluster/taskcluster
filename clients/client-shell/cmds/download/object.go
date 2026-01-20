package download

import (
	"fmt"
	"io"
	"time"

	"github.com/spf13/cobra"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcobject"
	"github.com/taskcluster/taskcluster/v96/clients/client-shell/config"
)

func downloadObject(credentials *tcclient.Credentials, name string, filename string, out io.Writer) error {
	fmt.Fprintf(out, "Downloading `%s` to `%s`\n", name, filename)
	start := time.Now()

	obj := tcobject.New(credentials, config.RootURL())

	contentType, contentLength, err := obj.DownloadToFile(name, filename)
	if err != nil {
		return err
	}

	duration := time.Since(start)
	fmt.Fprintf(out, "Downloaded %d bytes of type %s in %s (including API calls)\n", contentLength, contentType, duration)

	return nil
}

func init() {
	objectCmd := &cobra.Command{
		Use:   "object <name> <filename>",
		Short: "Download data directly from the object service to the named file",
		RunE: func(cmd *cobra.Command, args []string) error {
			name := args[0]
			filename := args[1]

			var creds *tcclient.Credentials
			if config.Credentials != nil {
				creds = config.Credentials.ToClientCredentials()
			}

			return downloadObject(creds, name, filename, cmd.OutOrStdout())
		},
		Args: cobra.ExactArgs(2),
	}
	downloadCmd.AddCommand(objectCmd)
}
