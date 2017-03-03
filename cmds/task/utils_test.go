package task

import (
	"io"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	assert "github.com/stretchr/testify/require"
	tcclient "github.com/taskcluster/taskcluster-client-go"
)

func TestStatusString(t *testing.T) {
	assert := assert.New(t)

	assert.Equal(getRunStatusString("only", ""), "only")
	assert.Equal(getRunStatusString("both", "here"), "both 'here'")
}

func TestExecuteHelper(t *testing.T) {
	assert := assert.New(t)

	dummyExecutor := func(_ *tcclient.Credentials, _ []string, _ io.Writer, _ *pflag.FlagSet) error {
		assert.True(true)
		return nil
	}

	runable := executeHelperE(dummyExecutor)
	assert.Error(runable(&cobra.Command{}, []string{}), "executeHelperE expects at least one argument")
	assert.NoError(runable(&cobra.Command{}, []string{"one"}))
}
