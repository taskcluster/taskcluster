package gwconfig

// gwconfig.Provider is an interface for configuring generic-worker.
// Implementors include AWSConfigProvider, AzureConfigProvider,
// GCPConfigProvider, and gwconfig.File for configuring generic-worker from a
// local file.
type Provider interface {
	UpdateConfig(c *Config) error
}
