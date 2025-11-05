//go:build !freebsd

package gdm3

import (
	"fmt"
	"strings"

	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/host"
)

// InteractiveUsername attempts to determine which single user is currently
// logged into a gnome3 desktop session. If it doesn't find precisely one user,
// it returns an error, otherwise it returns the user it found.
func InteractiveUsername() (string, error) {
	gnomeSessionUserList, err := host.Output("/usr/bin/env", "bash", "-c", "PROCPS_USERLEN=20 /usr/bin/w | /bin/grep gnome-[s]ession | /usr/bin/cut -f1 -d' '")
	if err != nil {
		return "", fmt.Errorf("cannot run command to determine the interactive user: %v", err)
	}
	lines := strings.Split(gnomeSessionUserList, "\n")
	if len(lines) != 2 || lines[1] != "" {
		return "", fmt.Errorf("number of gnome session users is not exactly one - not sure which user is interactively logged on: %#v", lines)
	}
	return lines[0], nil
}
