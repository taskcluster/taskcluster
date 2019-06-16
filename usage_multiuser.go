// +build multiuser

package main

func runTasksAsCurrentUserUsage() string {
	return `
          runTasksAsCurrentUser             If true, users will not be created for tasks, but
                                            the current OS user will be used. [default: false]`
}

func exitCode77() string {
	return `
    77     Not able to apply required file access permissions to the generic-worker config
           file so that task users can't read from or write to it.`
}
