package task

import (
	"bytes"
	"testing"

	"github.com/spf13/cobra"
	assert "github.com/stretchr/testify/require"
)

func TestLogCommand(t *testing.T) {
	assert := assert.New(t)

	buf := &bytes.Buffer{}
	cmd := &cobra.Command{}
	cmd.SetOutput(buf)

	args := []string{"TtAsnXdCS1-tAQxvMO4rHQ"}
	runLog(nil, args, cmd.OutOrStdout(), cmd.Flags())

	// This is the output of a static log
	s := "[taskcluster 2017-03-03 21:18:34.946Z] Task ID: TtAsnXdCS1-tAQxvMO4rHQ\n" +
		"[taskcluster 2017-03-03 21:18:34.946Z] Worker ID: i-035dd1bd8da876f13\n" +
		"[taskcluster 2017-03-03 21:18:34.946Z] Worker Group: us-west-1b\n" +
		"[taskcluster 2017-03-03 21:18:34.946Z] Worker Node Type: m3.large\n" +
		"[taskcluster 2017-03-03 21:18:34.946Z] Worker Type: tutorial\n" +
		"[taskcluster 2017-03-03 21:18:34.946Z] Public IP: 54.153.13.193\n" +
		"\n" +
		"[taskcluster 2017-03-03 21:18:48.518Z] === Task Starting ===\n" +
		"hello World\n" +
		"[taskcluster 2017-03-03 21:18:48.945Z] === Task Finished ===\n" +
		"[taskcluster 2017-03-03 21:18:48.946Z] Successful task run with exit code: 0 completed in 14.001 seconds\n"

	assert.Equal(string(buf.Bytes()), s, "Log's are not equal.")
}
