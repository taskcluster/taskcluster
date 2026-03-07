package main

const (
	CANT_SECURE_CONFIG          ExitCode = 77
	MISSING_ED25519_PRIVATE_KEY ExitCode = 82
)

func headlessTasksUsage() string {
	return `
          headlessTasks                     If true, no dedicated graphical session will be available to tasks.
                                            There will also be no reboots between tasks and multiple workers
                                            can be run on the same host. Useful for tasks that don't require
                                            a graphical session, such as software builds. [default: false]`
}

func exitCode77() string {
	return `
    77     Not able to apply required file access permissions to the generic-worker config
           file so that task users can't read from or write to it.`
}

func exitCode82() string {
	return `
    82     Missing ed25519 private key. Did you run generic-worker new-ed25519-keypair?`
}
