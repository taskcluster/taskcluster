package util

import (
	"fmt"
	"os"
)

// DisableOOM disables oom killer for the given process
func DisableOOM(pid int) error {
	return os.WriteFile(
		fmt.Sprintf("/proc/%d/oom_adj", pid),
		[]byte("-17"),
		0600,
	)
}
