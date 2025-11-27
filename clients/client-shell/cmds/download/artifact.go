package download

import (
	"fmt"
	"io"
	"strconv"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v94/clients/client-shell/config"
)

func downloadArtifact(credentials *tcclient.Credentials, taskID string, runID int64, name string, filename string, out io.Writer, flagSet *pflag.FlagSet) error {
	var runName string
	if runID == -1 {
		runName = "latest run"
	} else {
		runName = fmt.Sprintf("run %d", runID)
	}
	fmt.Fprintf(out, "Downloading `%s` from %s of task %s to `%s`\n", name, runName, taskID, filename)

	start := time.Now()

	queue := tcqueue.New(credentials, config.RootURL())
	contentType, contentLength, err := queue.DownloadArtifactToFile(taskID, runID, name, filename)
	if err != nil {
		return err
	}

	duration := time.Since(start)
	fmt.Fprintf(out, "Downloaded %d bytes of type %s in %s (including API calls)\n", contentLength, contentType, duration)

	return nil
}

func init() {
	objectCmd := &cobra.Command{
		Use:   "artifact <taskId> [<runId>] <name> <filename>",
		Short: "Download an artifact attached to the given task; if runId is omitted, the latest run is used",
		RunE: func(cmd *cobra.Command, args []string) error {
			taskID := args[0]
			var (
				runID    int64
				name     string
				filename string
				err      error
			)
			if len(args) == 4 {
				runID, err = strconv.ParseInt(args[1], 10, 0)
				if err != nil {
					return err
				}
				name = args[2]
				filename = args[3]
			} else {
				runID = -1
				name = args[1]
				filename = args[2]
			}

			var creds *tcclient.Credentials
			if config.Credentials != nil {
				creds = config.Credentials.ToClientCredentials()
			}

			return downloadArtifact(creds, taskID, runID, name, filename, cmd.OutOrStdout(), cmd.Flags())
		},
		Args: cobra.RangeArgs(3, 4),
	}
	downloadCmd.AddCommand(objectCmd)
}
