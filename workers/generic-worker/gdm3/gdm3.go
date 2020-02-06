// package gdm3 provides functions for interfacing with Gnome Desktop Manager 3 on linux
package gdm3

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/taskcluster/generic-worker/host"
)

var (
	automaticLogin        = regexp.MustCompile(`^\s*AutomaticLogin\s*=`)
	automaticLoginEnable  = regexp.MustCompile(`^\s*AutomaticLoginEnable\s*=`)
	automaticLoginReplace = regexp.MustCompile(`^\s*AutomaticLogin\s*=\s*(\S*)\s*$`)
)

// AutoLogonUser interprets source as the contents of the gdm3 custom.conf
// file, and parses it to look for an auto login user, and returns it if found,
// otherwise it returns the empty string.
func AutoLogonUser(source []byte) (username string) {
	iniFileLineHandler(source, func(section, line string) {
		if section == "daemon" {
			u := automaticLoginReplace.ReplaceAllString(line, "${1}")
			if u != line {
				username = u
				return
			}
		}
	})
	return
}

// SetAutoLogin interprets source as the contents of the gdm3 custom.conf file,
// and returns an updated version of it with the automatic desktop login
// enabled for the user specified by username.
func SetAutoLogin(username string, source []byte) (output []byte) {
	newLinesAdded := false
	outputLines := []string{}
	iniFileLineHandler(source, func(section, line string) {
		switch section {
		case "daemon":
			switch {
			case automaticLogin.MatchString(line):
				// discard any lines that set AutomaticLogin
				// log.Printf("Discarding %s", line)
			case automaticLoginEnable.MatchString(line):
				// discard any lines that set AutomaticLoginEnable
				// log.Printf("Discarding %s", line)
			default:
				// retain all other lines
				// log.Printf("Retaining %s", line)
				outputLines = append(outputLines, line)
			}
			if !newLinesAdded {
				// We've just entered [daemon] section, so set autologin settings
				// immediately, and flag that we've done it, so we only add this once.
				outputLines = append(
					outputLines,
					"# Set by generic-worker",
					"AutomaticLoginEnable = true",
					"AutomaticLogin = "+username,
					"",
				)
				newLinesAdded = true
			}
		default:
			// retain all lines of all other sections
			outputLines = append(outputLines, line)
		}
	})
	o := strings.Join(outputLines, "\n")
	return []byte(o)
}

// InteractiveUsername attempts to determine which single user is currently
// logged into a gnome3 desktop session. If it doesn't find precisely one user,
// it returns an error, otherwise it returns the user it found.
func InteractiveUsername() (string, error) {
	gnomeSessionUserList, err := host.CombinedOutput("/bin/bash", "-c", "PROCPS_USERLEN=20 /usr/bin/w -s | /bin/grep gnome-[s]ession | /usr/bin/cut -f1 -d' '")
	if err != nil {
		return "", fmt.Errorf("Cannot run command to determine the interactive user: %v", err)
	}
	lines := strings.Split(gnomeSessionUserList, "\n")
	if len(lines) != 2 || lines[1] != "" {
		return "", fmt.Errorf("Number of gnome session users is not exactly one - not sure which user is interactively logged on: %#v", lines)
	}
	return lines[0], nil
}

// iniFileLineHandler splits the ini file contents passed in data into lines
// separated by '\n' tracking which ini section each line is in. It then calls
// callback for each line in sequence, passing it the section name of the line
// and the raw line itself.
func iniFileLineHandler(data []byte, callback func(section, line string)) {
	section := ""
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		trimmedLine := strings.TrimSpace(line)
		if len(trimmedLine) > 1 && trimmedLine[0] == '[' && trimmedLine[len(trimmedLine)-1] == ']' {
			section = trimmedLine[1 : len(trimmedLine)-1]
		}
		callback(section, line)
	}
}
