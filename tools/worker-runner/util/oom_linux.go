package util

import (
	"fmt"
	"os"
)

// DisableOOM disables oom killer for the given process
func DisableOOM(pid int) error {
	return os.WriteFile(
		fmt.Sprintf("/proc/%d/oom_score_adj", pid),
		// Use -1000 to completely disable OOM-killing
		// https://man7.org/linux/man-pages/man5/proc_pid_oom_adj.5.html
		[]byte("-1000"),
		0600,
	)
}
