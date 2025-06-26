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
	}

	Result struct {
		SystemError error
		ExitError   *exec.ExitError
		Duration    time.Duration
		Aborted     bool
		KernelTime  time.Duration
		UserTime    time.Duration
		Usage       *ResourceUsage
		ExitCode    int
	}

	ResourceUsage struct {
		AverageAvailableSystemMemory uint64
		AverageSystemMemoryUsed      uint64
		PeakSystemMemoryUsed         uint64
		TotalSystemMemory            uint64
	}
)

// ExitCode returns the exit code, or
//
//	-1 if the process has not exited
//	-2 if the process crashed
//	-3 it could not be established what happened
//	-4 if process was aborted
func (r *Result) SetExitCode() {
	log.Print("Setting exit code")
	c := func() int {
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
	}()
	r.ExitCode = c
}

func (c *Command) Execute() (r *Result) {
	r = &Result{}
	started := time.Now()

	if c.ResourceMonitor != nil {
		usageChan := make(chan *ResourceUsage, 1)
		usageMeasurementsDone := make(chan struct{})

		go c.ResourceMonitor(usageChan, usageMeasurementsDone)

		defer func() {
			close(usageMeasurementsDone)
			r.Usage = <-usageChan
		}()
	}

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
		r.SetExitCode()
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
	var usageStr string
	if r.Usage != nil && r.Usage.TotalSystemMemory > 0 {
		usageStr = fmt.Sprintf(" Average Available System Memory: %v\n"+
			"      Average System Memory Used: %v\n"+
			"         Peak System Memory Used: %v\n"+
			"             Total System Memory: %v\n",
			FormatMemoryString(r.Usage.AverageAvailableSystemMemory),
			FormatMemoryString(r.Usage.AverageSystemMemoryUsed),
			FormatMemoryString(r.Usage.PeakSystemMemoryUsed),
			FormatMemoryString(r.Usage.TotalSystemMemory),
		)
	}
	if r.Aborted {
		return fmt.Sprintf("Command ABORTED after %v: %v\n%v", r.Duration, r.SystemError, usageStr)
	}
	if r.SystemError != nil {
		return fmt.Sprintf("System error executing command: %v", r.SystemError)
	}
	return fmt.Sprintf(""+
		"                       Exit Code: %v\n"+
		"                       User Time: %v\n"+
		"                     Kernel Time: %v\n"+
		"                       Wall Time: %v\n%v"+
		"                          Result: %v",
		r.ExitCode,
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

func (c *Command) DirectOutput(writer io.Writer) {
	c.Stdout = writer
	c.Stderr = writer
}

// FormatMemoryString formats a memory size in bytes into a human-readable string.
// The function returns a string with the value formatted to two decimal places
// and appended with the appropriate unit: "B" for bytes, "KiB" for kibibyte,
// "MiB" for mebibyte, or "GiB" for gibibyte.
func FormatMemoryString(bytes uint64) string {
	val := float64(bytes)
	if val < 1024 {
		return fmt.Sprintf("%f B", val)
	} else if val < 1024*1024 {
		kb := val / 1024
		return fmt.Sprintf("%.2f KiB", kb)
	} else if val < 1024*1024*1024 {
		mb := val / (1024 * 1024)
		return fmt.Sprintf("%.2f MiB", mb)
	} else {
		gb := val / (1024 * 1024 * 1024)
		return fmt.Sprintf("%.2f GiB", gb)
	}
}

// MonitorResources returns a function that monitors the system's memory usage at 500ms
// intervals while a command is executing.
// It tracks peak memory used, total memory available, and calculates the average memory used.
// If memory usage exceeds maxMemoryUsagePercent and available memory is less than
// minAvailableMemoryBytes for longer than allowedHighMemoryDurationSecs seconds,
// it calls the provided abort function. After the abort function is called, the monitoring stops.
// The function sends the collected ResourceUsage data through usageChan when monitoring stops.
// The monitoring can also be stopped by sending a signal through usageMeasurementsDone.
func MonitorResources(
	minAvailableMemoryBytes,
	maxMemoryUsagePercent uint64,
	allowedHighMemoryDuration time.Duration,
	disableOOMProtection bool,
	warn func(string, ...any),
	abort func(),
) func(chan *ResourceUsage, chan struct{}) {
	return func(usageChan chan *ResourceUsage, usageMeasurementsDone chan struct{}) {
		var numOfMeasurements, totalAvailableMemory, totalMemoryUsed uint64
		previouslyWarned := false
		usage := new(ResourceUsage)
		ticker := time.NewTicker(500 * time.Millisecond)
		var highMemoryStartTime time.Time

		defer func() {
			ticker.Stop()
			if numOfMeasurements > 0 {
				usage.AverageAvailableSystemMemory = totalAvailableMemory / numOfMeasurements
				usage.AverageSystemMemoryUsed = totalMemoryUsed / numOfMeasurements
			}
			usageChan <- usage
		}()

		for {
			select {
			case <-ticker.C:
				if vm, err := mem.VirtualMemory(); err == nil {
					numOfMeasurements++

					if vm.Used > usage.PeakSystemMemoryUsed {
						usage.PeakSystemMemoryUsed = vm.Used
					}
					if usage.TotalSystemMemory == 0 {
						usage.TotalSystemMemory = vm.Total
					}
					totalMemoryUsed += vm.Used
					totalAvailableMemory += vm.Available

					// if memory used is greater than maxMemoryUsagePercent
					// and available memory is less than minAvailableMemoryBytes,
					// then kill the process after allowedHighMemoryDuration has passed
					if vm.UsedPercent > float64(maxMemoryUsagePercent) && vm.Available < minAvailableMemoryBytes {
						if highMemoryStartTime.IsZero() {
							highMemoryStartTime = time.Now()
						}
						if time.Since(highMemoryStartTime) > allowedHighMemoryDuration {
							if disableOOMProtection {
								if !previouslyWarned {
									warn(
										"Memory usage above %d%% and available memory less than %v persisted for over %v!",
										maxMemoryUsagePercent,
										FormatMemoryString(minAvailableMemoryBytes),
										allowedHighMemoryDuration,
									)
									warn("OOM protections are disabled, continuing task...")
									previouslyWarned = true
								}
							} else {
								warn(
									"Memory usage above %d%% and available memory less than %v persisted for over %v!",
									maxMemoryUsagePercent,
									FormatMemoryString(minAvailableMemoryBytes),
									allowedHighMemoryDuration,
								)
								abort()
								return
							}
						}
					} else {
						highMemoryStartTime = time.Time{}
						previouslyWarned = false
					}
				}
			case <-usageMeasurementsDone:
				return
			}
		}
	}
}
