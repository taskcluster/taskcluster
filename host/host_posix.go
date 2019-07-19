// +build darwin linux

package host

import "log"

func ImmediateReboot() {
	log.Println("Immediate reboot being issued...")
	err := Run("/usr/bin/sudo", "/sbin/shutdown", "-r", "now", "generic-worker requested reboot")
	if err != nil {
		log.Fatal(err)
	}
}

func ImmediateShutdown(cause string) {
	log.Println("Immediate shutdown being issued...")
	err := Run("/usr/bin/sudo", "/sbin/shutdown", "-h", "now", cause)
	if err != nil {
		log.Fatal(err)
	}
}
