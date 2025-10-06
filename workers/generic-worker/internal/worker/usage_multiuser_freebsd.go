//go:build multiuser

package worker

func enableTaskFeatures() string {
	return `
          enableInteractive                 Enables the Interactive feature to be used in the
                                            task payload. [default: true]
          enableRunTaskAsCurrentUser        Enables the Run Task As Current User feature to be
                                            used in the task payload. [default: true]`
}

func exitCode83() string {
	return ""
}

func customTargetsSummary() string {
	return ""
}

func customTargets() string {
	return ""
}
