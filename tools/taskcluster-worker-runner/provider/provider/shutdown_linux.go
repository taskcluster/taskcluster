package provider

import "os/exec"

// Shutdown spawns the "shutdown -h now" command to halt the machine
func Shutdown() error {
	return exec.Command("shutdown", "-h", "now").Run()
}
