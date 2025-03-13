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
		abort                 chan struct{}
		usageChan             chan *ResourceUsage
		usageMeasurementsDone chan struct{}
	}

	Result struct {
		SystemError error
		ExitError   *exec.ExitError
		Duration    time.Duration
		Aborted     bool
		KernelTime  time.Duration
		UserTime    time.Duration
		Usage       *ResourceUsage
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

	defer close(c.usageMeasurementsDone)

	c.mutex.Lock()
	err := c.Start()
	c.mutex.Unlock()
	if err != nil {
		r.SystemError = err
		return
	}

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
		return fmt.Sprintf("Command ABORTED after %v: %v", r.Duration, r.SystemError)
	}
	if r.SystemError != nil {
		return fmt.Sprintf("System error executing command: %v", r.SystemError)
	}
	var usageStr string
	if r.Usage != nil && r.Usage.TotalMemoryAvailable > 0 {
		usageStr = fmt.Sprintf(" Average Memory Used: %v\n"+
			"    Peak Memory Used: %v\n"+
			" Total System Memory: %v\n",
			formatMemoryString(r.Usage.AverageMemoryUsed),
			formatMemoryString(r.Usage.PeakMemoryUsed),
			formatMemoryString(r.Usage.TotalMemoryAvailable),
		)
	}
	return fmt.Sprintf(""+
		"           Exit Code: %v\n"+
		"           User Time: %v\n"+
		"         Kernel Time: %v\n"+
		"           Wall Time: %v\n%v"+
		"              Result: %v",
		r.ExitCode(),
		r.UserTime,
		r.KernelTime,
		r.Duration,
		usageStr,
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

// GatherUsage collects the resource usage data for the command execution.
func (r *Result) GatherUsage(c *Command) {
	r.Usage = <-c.usageChan
}

func (c *Command) DirectOutput(writer io.Writer) {
	c.Stdout = writer
	c.Stderr = writer
}

// formatMemoryString formats a memory size in bytes into a human-readable string.
// It accepts a value of type float64 or uint64 representing the number of bytes.
// The function returns a string with the value formatted to two decimal places
// and appended with the appropriate unit: "B" for bytes, "MB" for megabytes, or "GB" for gigabytes.
func formatMemoryString[T float64 | uint64](bytes T) string {
	val := float64(bytes)
	if val < 1024*1024 {
		return fmt.Sprintf("%f B", val)
	} else if val < 1024*1024*1024 {
		mb := val / (1024 * 1024)
		return fmt.Sprintf("%.2f MB", mb)
	} else {
		gb := val / (1024 * 1024 * 1024)
		return fmt.Sprintf("%.2f GB", gb)
	}
}

// MonitorResources monitors the system's memory usage at 500ms intervals while a command is executing.
// It tracks peak memory used, total memory available, and calculates the average memory used.
// If memory usage exceeds 90% for five consecutive measurements, it calls the provided abort function.
// The abort function is called with a boolean indicating if a warning was previously issued.
// If the abort function returns true (indicating the task will be aborted), the monitoring stops.
// The function sends the collected ResourceUsage data through c.usageChan when monitoring stops.
// The monitoring can also be stopped by sending a signal through c.usageMeasurementsDone.
func (c *Command) MonitorResources(abort func(previouslyWarned bool) bool) {
	var consecutiveHighMemoryUsage, numOfMeasurements, totalMemoryUsed uint64
	previouslyWarned := false
	usage := new(ResourceUsage)
	ticker := time.NewTicker(500 * time.Millisecond)

	defer func() {
		ticker.Stop()
		if numOfMeasurements > 0 {
			usage.AverageMemoryUsed = float64(totalMemoryUsed) / float64(numOfMeasurements)
		}
		c.usageChan <- usage
	}()

	for {
		select {
		case <-ticker.C:
			if vm, err := mem.VirtualMemory(); err == nil {
				numOfMeasurements++

				if vm.Used > usage.PeakMemoryUsed {
					usage.PeakMemoryUsed = vm.Used
				}
				if usage.TotalMemoryAvailable == 0 {
					usage.TotalMemoryAvailable = vm.Total
				}
				totalMemoryUsed += vm.Used

				// if memory used is greater than 90%
				// for 5 measurements consecutively, then
				// kill the process
				if vm.UsedPercent >= 90.0 {
					consecutiveHighMemoryUsage++
					if consecutiveHighMemoryUsage >= 5 {
						if abort(previouslyWarned) {
							return
						} else {
							previouslyWarned = true
						}
					}
				} else {
					consecutiveHighMemoryUsage = 0
				}
			}
		case <-c.usageMeasurementsDone:
			return
		}
	}
}
