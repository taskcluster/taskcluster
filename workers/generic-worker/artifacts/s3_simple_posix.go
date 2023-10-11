//go:build simple && (darwin || linux || freebsd)

package artifacts

import (
	"fmt"
	"runtime"

	"github.com/taskcluster/taskcluster/v56/workers/generic-worker/process"
)

func copyAsTaskUser(dst, src, workingDir string, pd *process.PlatformData) error {
	var copyBin string
	switch runtime.GOOS {
	case "darwin":
		copyBin = "/bin/cp"
	default:
		copyBin = "/usr/bin/cp"
	}
	cmd, err := process.NewCommand([]string{copyBin, src, dst}, workingDir, []string{})
	if err != nil {
		return fmt.Errorf("Cannot create process to copy file %v as task user from file %v: %v", src, dst, err)
	}
	result := cmd.Execute()
	if result.ExitError != nil {
		return fmt.Errorf("Cannot copy file %v as task user from file %v: %v", src, dst, result)
	}
	return nil
}
