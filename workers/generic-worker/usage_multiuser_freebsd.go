//go:build multiuser

package main

func enableTaskFeatures() string {
	return `
          enableInteractive                 Enables the Interactive feature to be used in the
                                            task payload. [default: true]
          enableRunTaskAsCurrentUser        Enables the Run Task As Current User feature to be
                                            used in the task payload. [default: true]`
}
