//go:build !freebsd

package gdm3

import (
	"fmt"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster/v68/workers/generic-worker/host"
)

// InteractiveUsername attempts to determine which single user is currently
// logged into a gnome3 desktop session. If it doesn't find precisely one user,
// it returns an error, otherwise it returns the user it found.
func InteractiveUsername() (string, error) {
	const maxRetries = 5
	const delay = 1 * time.Second
	var lines []string

	for i := 0; i < maxRetries; i++ {
		gnomeSessionUserList, err := host.CombinedOutput("/usr/bin/env", "bash", "-c", "PROCPS_USERLEN=20 /usr/bin/w | /bin/grep gnome-[s]ession | /usr/bin/cut -f1 -d' '")
		if err != nil {
			return "", fmt.Errorf("cannot run command to determine the interactive user: %v", err)
		}
		lines = strings.Split(gnomeSessionUserList, "\n")
		if len(lines) != 2 || lines[1] != "" {
			time.Sleep(delay)
		} else {
			return lines[0], nil
		}
	}

	return "", fmt.Errorf("number of gnome session users is not exactly one - not sure which user is interactively logged on: %#v", lines)
}
