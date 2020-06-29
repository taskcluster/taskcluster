package version

import (
	"bytes"
	"testing"

	"github.com/spf13/cobra"
	assert "github.com/stretchr/testify/require"
)

func setUpCommand() (*bytes.Buffer, *cobra.Command) {
	buf := &bytes.Buffer{}
	cmd := &cobra.Command{}
	cmd.SetOutput(buf)

	return buf, cmd
}

func TestVersionCommand(t *testing.T) {
	assert := assert.New(t)

	buf, cmd := setUpCommand()

	printVersion(cmd, nil)

	assert.Contains(buf.String(), VersionNumber, "VersionNumber not found in version output")
}

func TestUpdateCommand(t *testing.T) {
	assert := assert.New(t)

	buf, cmd := setUpCommand()

	log.SetOutput(buf)

	update(cmd, nil)

	assert.Contains(buf.String(), "taskcluster", "Update command not returning a valid output")

}
