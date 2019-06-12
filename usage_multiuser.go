// +build multiuser

package main

func runTasksAsCurrentUserUsage() string {
	return `
          runTasksAsCurrentUser             If true, users will not be created for tasks, but
                                            the current OS user will be used. [default: false]`
}
