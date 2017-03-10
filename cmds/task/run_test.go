package task

import (
	"testing"

	"github.com/spf13/cobra"
	assert "github.com/stretchr/testify/require"
)

func TestInvalidTaskCreate(t *testing.T) {
	assert := assert.New(t)

	cmd := &cobra.Command{}

	assert.Error(runRunTask(cmd, []string{}), "create task should error with insufficient args")
	assert.Error(runRunTask(cmd, []string{"ubuntu:14.04"}), "create task should error with insufficient args")
}
