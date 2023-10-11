//go:build multiuser

package artifacts

import (
	"fmt"
	"log"
	"path/filepath"

	"github.com/taskcluster/taskcluster/v56/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v56/workers/generic-worker/process"
)

func copyAsTaskUser(dst, src, workingDir string, pd *process.PlatformData) error {
	output, err := host.CombinedOutput("icacls", src)
	if err != nil {
		return fmt.Errorf("Cannot run icacls on %v: %v", src, err)
	}
	log.Printf("icacls src output: %s", output)
	output, err = host.CombinedOutput("icacls", filepath.Dir(dst))
	if err != nil {
		return fmt.Errorf("Cannot run icacls on %v: %v", filepath.Dir(dst), err)
	}
	log.Printf("icacls dst output: %s", output)
	cmd, err := process.NewCommand([]string{"cmd.exe", "/c", "copy", "/y", src, dst}, workingDir, nil, pd)
	if err != nil {
		return fmt.Errorf("Cannot create process to copy file %v as task user from file %v: %v", src, dst, err)
	}
	result := cmd.Execute()
	log.Printf("copyAsTaskUser result: %v", result)
	if result.ExitError != nil {
		return fmt.Errorf("Cannot copy file %v as task user from file %v: %v", src, dst, result)
	}
	return nil
}
