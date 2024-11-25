//go:build darwin || freebsd

package gwconfig

type PublicPlatformConfig struct {
	EnableInteractive bool `json:"enableInteractive"`
}

func DefaultPublicPlatformConfig() PublicPlatformConfig {
	return PublicPlatformConfig{
		EnableInteractive: true,
	}
}

func (c *PublicPlatformConfig) D2GConfigContainerEngine() string {
	return ""
}

func (c *PublicPlatformConfig) D2GEnabled() bool {
	return false
}
