package gwconfig

// gwconfig.Provider is an interface for configuring generic-worker.
// This is implemented by gwconfig.File for configuring generic-worker from a local file.
type Provider interface {
	UpdateConfig(c *Config) error
}
