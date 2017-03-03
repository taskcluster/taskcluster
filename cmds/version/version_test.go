package version

import (
	"bytes"
	"testing"

	"github.com/spf13/cobra"
	assert "github.com/stretchr/testify/require"
)

func TestVersionCommand(t *testing.T) {
	assert := assert.New(t)

	buf := &bytes.Buffer{}
	cmd := &cobra.Command{}
	cmd.SetOutput(buf)

	printVersion(cmd, nil)

	assert.Contains(string(buf.Bytes()), VersionNumber, "VersionNumber not found in version output")
}
