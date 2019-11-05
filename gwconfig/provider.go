package gwconfig

// gwconfig.Provider is an interface for configuring generic-worker.
// Implementors include AWSProvisioner, AWSProvider, GCPConfigProvider, and
// gwconfig.File for configuring generic-worker from a local file.
type Provider interface {
	// NewestDeploymentID fetches the latest/newest/most-recent deployment ID.
	// Depending on the provider, this may make a network request to retrieve
	// data from a taskcluster entity (such as a worker pool definition) or may
	// just look at the local generic-worker config file. See generic-worker
	// help text for information about the deploymentId property.
	NewestDeploymentID() (string, error)
	UpdateConfig(c *Config) error
}
