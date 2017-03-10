package task

import (
	"testing"

	"github.com/spf13/cobra"
	assert "github.com/stretchr/testify/require"
)

func TestInvalidTaskCreate(t *testing.T) {
	assert := assert.New(t)

	cmd := &cobra.Command{}

	assert.Error(runCreateTask(cmd, []string{}), "create task should error with insufficient args")
	assert.Error(runCreateTask(cmd, []string{"ubuntu:14.04"}), "create task should error with insufficient args")

	cmd.Flags().String("task-id", "invalid", "")
	assert.Error(runCreateTask(cmd, []string{"ubuntu:14.04", "echo hello world"}), "create task should error with invalid taskID")

	//	assert.Error(runCreateTask(cmd, []string{"ubuntu:14.04", "echo hello world"}), "create task should error with invalid taskID")
}
