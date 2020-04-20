package util

import (
	"fmt"
	"io/ioutil"
)

// DisableOOM disables oom killer for the given process
func DisableOOM(pid int) error {
	return ioutil.WriteFile(
		fmt.Sprintf("/proc/%d/oom_adj", pid),
		[]byte("-17"),
		0600,
	)
}
