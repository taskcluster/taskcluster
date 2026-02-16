//go:build !darwin

package process

import (
	"os/exec"
	"sync"
)

type (
	Command struct {
		// ResourceMonitor is a function that monitors the system's resource usage.
		// It should send the resource usage data to the first channel of type
		// *ResourceUsage and stop measuring usage when the second channel of
		// type struct{} is closed.
		ResourceMonitor func(chan *ResourceUsage, chan struct{})
		mutex           sync.RWMutex
		*exec.Cmd
		// abort channel is closed when Kill() is called so that Execute() can
		// return even if cmd.Wait() is blocked. This is useful since cmd.Wait()
		// sometimes does not return promptly.
		abort chan struct{}
		// Once command has run, Result is updated (similar to cmd.ProcessState)
		result *Result
	}
)
