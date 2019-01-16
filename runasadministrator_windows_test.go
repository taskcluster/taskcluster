package main

import (
	"testing"
)

func TestRunAsAdministratorDisabled(t *testing.T) {
	defer setup(t)()
	if config.RunTasksAsCurrentUser {
		t.Skip("Skipping since running as current user...")
	}
	payload := GenericWorkerPayload{
		Command: []string{
			`whoami /groups`,
			// S-1-16-12288 is SID of 'High Mandatory Level' which implies process is elevated
			// See also https://msdn.microsoft.com/en-us/library/bb625963.aspx
			// and https://docs.microsoft.com/en-us/windows/desktop/api/winnt/ns-winnt-_token_elevation
			`whoami /groups | C:\Windows\System32\find.exe "S-1-16-12288" > nul`,
		},
		MaxRunTime: 10,
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

func TestRunAsAdministratorEnabledMissingScopes(t *testing.T) {
	defer setup(t)()
	if config.RunTasksAsCurrentUser {
		t.Skip("Skipping since running as current user...")
	}
	payload := GenericWorkerPayload{
		Command: []string{
			`whoami /groups`,
			// S-1-16-12288 is SID of 'High Mandatory Level' which implies process is elevated
			// See also https://msdn.microsoft.com/en-us/library/bb625963.aspx
			// and https://docs.microsoft.com/en-us/windows/desktop/api/winnt/ns-winnt-_token_elevation
			`whoami /groups | C:\Windows\System32\find.exe "S-1-16-12288" > nul`,
		},
		MaxRunTime: 10,
		Features: FeatureFlags{
			RunAsAdministrator: true,
		},
		OSGroups: []string{
			"Administrators",
		},
	}
	td := testTask(t)
	td.Scopes = []string{
		"generic-worker:os-group:" + td.ProvisionerID + "/" + td.WorkerType + "/Administrators",
	}

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}

func TestRunAsAdministratorMissingOSGroup(t *testing.T) {
	defer setup(t)()
	if config.RunTasksAsCurrentUser {
		t.Skip("Skipping since running as current user...")
	}
	payload := GenericWorkerPayload{
		Command: []string{
			`whoami /groups`,
			// S-1-16-12288 is SID of 'High Mandatory Level' which implies process is elevated
			// See also https://msdn.microsoft.com/en-us/library/bb625963.aspx
			// and https://docs.microsoft.com/en-us/windows/desktop/api/winnt/ns-winnt-_token_elevation
			`whoami /groups | C:\Windows\System32\find.exe "S-1-16-12288" > nul`,
		},
		MaxRunTime: 10,
		OSGroups:   []string{}, // Administrators not included!
		Features: FeatureFlags{
			RunAsAdministrator: true,
		},
	}
	td := testTask(t)
	td.Scopes = []string{
		"generic-worker:run-as-administrator:" + td.ProvisionerID + "/" + td.WorkerType,
		"generic-worker:os-group:" + td.ProvisionerID + "/" + td.WorkerType + "/Administrators",
	}

	// either UAC is enabled, and this should have malformed-payload because
	// does not have Administrators group set in osGroups; or UAC is disabled
	// and should have malformed-payload since runAsAdministrator shouldn't be
	// allowed for a worker type with UAC disabled
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}

func TestChainOfTrustWithRunAsAdministrator(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command: []string{
			`type "` + config.OpenpgpSigningKeyLocation + `"`,
		},
		MaxRunTime: 5,
		OSGroups:   []string{"Administrators"},
		Features: FeatureFlags{
			ChainOfTrust:       true,
			RunAsAdministrator: true,
		},
	}
	td := testTask(t)
	td.Scopes = []string{
		"generic-worker:run-as-administrator:" + td.ProvisionerID + "/" + td.WorkerType,
		"generic-worker:os-group:" + td.ProvisionerID + "/" + td.WorkerType + "/Administrators",
	}

	if config.RunTasksAsCurrentUser {
		// When running as current user, chain of trust key is not private so
		// generic-worker should detect that it isn't secured from task user
		// and cause malformed-payload exception.
		expectChainOfTrustKeyNotSecureMessage(t, td, payload)
		return

	}

	// if UAC is disabled, we should have malformed-payload for trying to use
	// runAsAdministrator. if it is enabled, we should have malformed-payload
	// because chain of trust certificate isn't secure.
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
}

func TestChainOfTrustWithoutRunAsAdministrator(t *testing.T) {
	defer setup(t)()
	payload := GenericWorkerPayload{
		Command: []string{
			`type "` + config.OpenpgpSigningKeyLocation + `"`,
		},
		MaxRunTime: 5,
		OSGroups:   []string{"Administrators"},
		Features: FeatureFlags{
			ChainOfTrust:       true,
			RunAsAdministrator: false, // FALSE !!!!
		},
	}
	td := testTask(t)
	td.Scopes = []string{
		"generic-worker:run-as-administrator:" + td.ProvisionerID + "/" + td.WorkerType,
		"generic-worker:os-group:" + td.ProvisionerID + "/" + td.WorkerType + "/Administrators",
	}

	if config.RunTasksAsCurrentUser {
		// When running as current user, chain of trust key is not private so
		// generic-worker should detect that it isn't secured from task user
		// and cause malformed-payload exception.
		expectChainOfTrustKeyNotSecureMessage(t, td, payload)
		return

	}

	if UACEnabled() {
		_ = submitAndAssert(t, td, payload, "failed", "failed")
	} else {
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}
}

func TestRunAsAdministratorEnabled(t *testing.T) {
	defer setup(t)()
	if config.RunTasksAsCurrentUser {
		t.Skip("Skipping since running as current user...")
	}
	payload := GenericWorkerPayload{
		Command: []string{
			`whoami /groups`,
			// S-1-16-12288 is SID of 'High Mandatory Level' which implies process is elevated
			// See also https://msdn.microsoft.com/en-us/library/bb625963.aspx
			// and https://docs.microsoft.com/en-us/windows/desktop/api/winnt/ns-winnt-_token_elevation
			`whoami /groups | C:\Windows\System32\find.exe "S-1-16-12288" > nul`,
		},
		MaxRunTime: 10,
		Features: FeatureFlags{
			RunAsAdministrator: true,
		},
		OSGroups: []string{
			"Administrators",
		},
	}
	td := testTask(t)
	td.Scopes = []string{
		"generic-worker:run-as-administrator:" + td.ProvisionerID + "/" + td.WorkerType,
		"generic-worker:os-group:" + td.ProvisionerID + "/" + td.WorkerType + "/Administrators",
	}

	if UACEnabled() {
		_ = submitAndAssert(t, td, payload, "completed", "completed")
	} else {
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}
}
