package host

import (
	"log"
	"strings"
)

func ImmediateReboot() {
	log.Println("Immediate reboot being issued...")
	err := Run("C:\\Windows\\System32\\shutdown.exe", "/r", "/t", "3", "/c", "generic-worker requested reboot")
	if err != nil {
		log.Fatal(err)
	}
}

// EscapePowerShellSingleQuote escapes single quotes for use inside a
// PowerShell single-quoted string by doubling them (e.g. "it's" → "it”s").
func EscapePowerShellSingleQuote(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

func ImmediateShutdown(cause string) {
	log.Println("Immediate shutdown being issued...")
	err := Run("C:\\Windows\\System32\\shutdown.exe", "/s", "/t", "3", "/c", cause)
	if err != nil {
		log.Fatal(err)
	}
}
