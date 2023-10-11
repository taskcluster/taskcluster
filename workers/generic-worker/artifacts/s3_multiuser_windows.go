//go:build multiuser

package artifacts

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v56/workers/generic-worker/process"
)

func copyAsTaskUser(dst, src, workingDir string, pd *process.PlatformData) error {
	cmd, err := process.NewCommand([]string{"cmd", "/c", "copy", src, dst}, workingDir, []string{}, pd)
	if err != nil {
		return fmt.Errorf("Cannot create process to copy file %v as task user from file %v: %v", src, dst, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("Cannot copy file %v as task user from file %v: %v", src, dst, result)
	}
	return nil
}
