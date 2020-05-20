// +build multiuser

package main

const (
	CANT_SECURE_CONFIG ExitCode = 77
)

func runTasksAsCurrentUserUsage() string {
	return `
          runTasksAsCurrentUser             If true, users will still be created for tasks, but
                                            tasks will be executed as the current OS user. [default: false]`
}

func exitCode77() string {
	return `
    77     Not able to apply required file access permissions to the generic-worker config
           file so that task users can't read from or write to it.`
}
