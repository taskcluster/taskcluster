// package gdm3 provides functions for interfacing with Gnome Desktop Manager 3
package gdm3

import (
	"regexp"
	"strings"
)

var (
	automaticLogin       = regexp.MustCompile(`^\s*AutomaticLogin\s*=`)
	automaticLoginEnable = regexp.MustCompile(`^\s*AutomaticLoginEnable\s*=`)
)

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

// iniFileLineHandler splits the ini file contents passed in data into lines
// separated by '\n' tracking which ini section each line is in. It then calls
// callback for each line in sequence, passing it the section name of the line
// and the raw line itself.
func iniFileLineHandler(data []byte, callback func(section, line string)) {
	section := ""
	lines := strings.SplitSeq(string(data), "\n")
	for line := range lines {
		trimmedLine := strings.TrimSpace(line)
		if len(trimmedLine) > 1 && trimmedLine[0] == '[' && trimmedLine[len(trimmedLine)-1] == ']' {
			section = trimmedLine[1 : len(trimmedLine)-1]
		}
		callback(section, line)
	}
}
