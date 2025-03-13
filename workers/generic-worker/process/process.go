package process

import (
	"fmt"
	"io"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/shirou/gopsutil/v4/mem"
)

func (r *Result) Succeeded() bool {
	return r.SystemError == nil && r.ExitError == nil && !r.Aborted
}

type (
	Command struct {
		mutex sync.RWMutex
		*exec.Cmd
		// abort channel is closed when Kill() is called so that Execute() can
		// return even if cmd.Wait() is blocked. This is useful since cmd.Wait()
		// sometimes does not return promptly.
		abort chan struct{}
	}

	Result struct {
		SystemError error
		ExitError   *exec.ExitError
		Duration    time.Duration
		Aborted     bool
		KernelTime  time.Duration
		UserTime    time.Duration
		Usage       ResourceUsage
	}

	ResourceUsage struct {
		AverageMemoryUsed    float64
		PeakMemoryUsed       uint64
		TotalMemoryAvailable uint64
	}
)

// ExitCode returns the exit code, or
//
//	-1 if the process has not exited
//	-2 if the process crashed
//	-3 it could not be established what happened
//	-4 if process was aborted
func (r *Result) ExitCode() int {
	if r.Aborted {
		return -4
	}
	if r.SystemError != nil {
		return -2
	}
	if r.ExitError == nil {
		return 0
	}
	if status, ok := r.ExitError.Sys().(syscall.WaitStatus); ok {
		return status.ExitStatus() // -1 if not exited
	}
	return -3
}

func (c *Command) Execute() (r *Result) {
	r = &Result{}
	started := time.Now()
	c.mutex.Lock()
	err := c.Start()
	c.mutex.Unlock()
	if err != nil {
		r.SystemError = err
		return
	}

	done := make(chan struct{})
	usageChan := make(chan ResourceUsage, 1)
	go monitorResources(usageChan, done)

	exitErr := make(chan error)
	// wait for command to complete in separate go routine, so we handle abortion in parallel to command termination
	go func() {
		err := c.Wait()
		exitErr <- err
	}()

	select {
	case err = <-exitErr:
		r.UserTime = c.ProcessState.UserTime()
		r.KernelTime = c.ProcessState.SystemTime()
		if err != nil {
			if exiterr, ok := err.(*exec.ExitError); ok {
				r.ExitError = exiterr
			} else {
				r.SystemError = err
			}
		}
	case <-c.abort:
		r.SystemError = fmt.Errorf("process aborted")
		r.Aborted = true
	}

	close(done)
	r.Usage = <-usageChan

	finished := time.Now()
	// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
	r.Duration = finished.Round(0).Sub(started)
	return
}

func (c *Command) String() string {
	return fmt.Sprintf("%q", c.Args)
}

func (r *Result) String() string {
	if r.Aborted {
		return fmt.Sprintf("Command ABORTED after %v", r.Duration)
	}
	if r.SystemError != nil {
		return fmt.Sprintf("System error executing command: %v", r.SystemError)
	}
	return fmt.Sprintf(""+
		"           Exit Code: %v\n"+
		"           User Time: %v\n"+
		"         Kernel Time: %v\n"+
		"           Wall Time: %v\n"+
		" Average Memory Used: %v\n"+
		"    Peak Memory Used: %v\n"+
		" Total System Memory: %v\n"+
		"              Result: %v",
		r.ExitCode(),
		r.UserTime,
		r.KernelTime,
		r.Duration,
		formatMemoryString(r.Usage.AverageMemoryUsed),
		formatMemoryString(float64(r.Usage.PeakMemoryUsed)),
		formatMemoryString(float64(r.Usage.TotalMemoryAvailable)),
		r.Verdict(),
	)
}

func (r *Result) Verdict() string {
	switch {
	case r.Aborted:
		return "ABORTED"
	case r.ExitError == nil:
		return "SUCCEEDED"
	default:
		return "FAILED"
	}
}

func (c *Command) DirectOutput(writer io.Writer) {
	c.Stdout = writer
	c.Stderr = writer
}

func formatMemoryString(bytes float64) string {
	if bytes < 1024*1024 {
		return fmt.Sprintf("%f B", bytes)
	} else if bytes < 1024*1024*1024 {
		mb := bytes / (1024 * 1024)
		return fmt.Sprintf("%.2f MB", mb)
	} else {
		gb := bytes / (1024 * 1024 * 1024)
		return fmt.Sprintf("%.2f GB", gb)
	}
}

func monitorResources(usageChan chan ResourceUsage, done chan struct{}) {
	var numOfMeasurements, peakMemoryUsed, totalMemoryAvailable, totalMemoryUsed uint64
	ticker := time.NewTicker(1 * time.Second)

	for {
		select {
		case <-ticker.C:
			if vm, err := mem.VirtualMemory(); err == nil {
				if vm.Used > peakMemoryUsed {
					peakMemoryUsed = vm.Used
				}
				if totalMemoryAvailable == 0 {
					totalMemoryAvailable = vm.Total
				}
				totalMemoryUsed += vm.Used
				numOfMeasurements++
			}
		case <-done:
			if numOfMeasurements > 0 {
				usageChan <- ResourceUsage{
					AverageMemoryUsed:    float64(totalMemoryUsed) / float64(numOfMeasurements),
					PeakMemoryUsed:       peakMemoryUsed,
					TotalMemoryAvailable: totalMemoryAvailable,
				}
			} else {
				usageChan <- ResourceUsage{}
			}
			return
		}
	}
}
