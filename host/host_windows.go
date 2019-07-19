package host

import "log"

func ImmediateReboot() {
	log.Println("Immediate reboot being issued...")
	err := Run("C:\\Windows\\System32\\shutdown.exe", "/r", "/t", "3", "/c", "generic-worker requested reboot")
	if err != nil {
		log.Fatal(err)
	}
}

func ImmediateShutdown(cause string) {
	log.Println("Immediate shutdown being issued...")
	err := Run("C:\\Windows\\System32\\shutdown.exe", "/s", "/t", "3", "/c", cause)
	if err != nil {
		log.Fatal(err)
	}
}
