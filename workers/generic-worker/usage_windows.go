package main

const (
	CANT_GRANT_CONTROL_OF_WINSTA_AND_DESKTOP ExitCode = 74
)

func installServiceSummary() string {
	return `
    generic-worker install service          [--nssm           NSSM-EXE]
                                            [--service-name   SERVICE-NAME]
                                            [--config         CONFIG-FILE]
                                            [--configure-for-aws | --configure-for-gcp]`
}

func customTargetsSummary() string {
	return `
    generic-worker grant-winsta-access      --sid SID`
}

func installService() string {
	return `
    install service                         This will install the generic worker as a
                                            Windows service running under the Local System
                                            account. This is the preferred way to run the
                                            worker under Windows. Note, the service will
                                            be configured to start automatically. If you
                                            wish the service only to run when certain
                                            preconditions have been met, it is recommended
                                            to disable the automatic start of the service,
                                            after you have installed the service, and
                                            instead explicitly start the service when the
                                            preconditions have been met.`
}

func customTargets() string {
	return `
    grant-winsta-access                     Used internally by generic-worker to grant a
                                            logon SID full control of the interactive
                                            windows station and desktop.`
}

func platformCommandLineParameters() string {
	return `
    --nssm NSSM-EXE                         The full path to nssm.exe to use for installing
                                            the service.
                                            [default: C:\nssm-2.24\win64\nssm.exe]
    --service-name SERVICE-NAME             The name that the Windows service should be
                                            installed under. [default: Generic Worker]`
}

func exitCode65() string {
	return `
    65     Not able to install generic-worker on the system.`
}

func exitCode74() string {
	return `
    74     Could not grant provided SID full control of interactive windows stations and
           desktop.`
}

func sidSID() string {
	return `
    --sid SID                               A SID to be granted full control of the
                                            interactive windows station and desktop, for
                                            example: 'S-1-5-5-0-41431533'.`
}
