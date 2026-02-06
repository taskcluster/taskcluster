//go:build multiuser

package main

const (
	CANT_LAUNCH_AGENT ExitCode = 83
)

func enableTaskFeatures() string {
	return `
          enableInteractive                 Enables the Interactive feature to be used in the
                                            task payload. [default: true]
          enableRunTaskAsCurrentUser        Enables the Run Task As Current User feature to be
                                            used in the task payload. Automatically disabled
                                            when capacity > 1 to preserve task isolation.
                                            [default: true]`
}

func customTargetsSummary() string {
	return `
    generic-worker launch-agent`
}

func customTargets() string {
	return `
    launch-agent                            Used internally by Generic Worker. Generic Worker
                                            runs as a Launch Daemon, but configures a Launch
                                            Agent to run on desktop login as the task user.
                                            This Launch Agent executes this Generic Worker
                                            subcommand, in order to receive requests from
                                            the Generic Worker Launch Daemon and exectue them
                                            in the context of the desktop session.`
}

func exitCode83() string {
	return `
    83     Could not launch agent`
}
