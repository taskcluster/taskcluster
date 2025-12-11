package task

import (
	"io"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	assert "github.com/stretchr/testify/require"
	tcclient "github.com/taskcluster/taskcluster/v95/clients/client-go"
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

func TestStringFlagHelper(t *testing.T) {
	assert := assert.New(t)

	fs := pflag.NewFlagSet("TestStringFlagHelper", pflag.ContinueOnError)
	fs.String("exists", "val", "this one exists")

	assert.NotPanics(func() {
		stringFlagHelper(fs, "exists")
	}, "should not panic")

	assert.Equal("val", stringFlagHelper(fs, "exists"))

	assert.Panics(func() {
		stringFlagHelper(fs, "not-exists")
	}, "should panic")
}
