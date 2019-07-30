package runner

// Get a fragment of a usage message that describes the configuration file format
func Usage() string {
	return `
## Configuration

Configuration for this process is in the form of a YAML file with the following fields:

	provider: (required) information about the provider for this worker

		providerType: (required) the worker-manager providerType responsible for this worker;
			this generally indicates the cloud the worker is running in, or 'static' for a
			non-cloud-based worker; see below.

	worker: (required) information about the worker being run

		implementation: (required) the name of the worker implementation; see below.

	workerConfig: arbitrary data which forms the basics of the config passed to the worker;
		this will be merged with several other sources of configuration.

	getSecrets: if true (the default), then configuration is fetched from the secrets service
		and merged with the worker configuration.  This option is generally only used in testing.
`
}
