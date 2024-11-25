package gwconfig

type PublicPlatformConfig struct {
	EnableRDP                bool `json:"enableRDP"`
	EnableRunAsAdministrator bool `json:"enableRunAsAdministrator"`
}

func DefaultPublicPlatformConfig() PublicPlatformConfig {
	return PublicPlatformConfig{
		EnableRDP:                true,
		EnableRunAsAdministrator: true,
	}
}

func (c *PublicPlatformConfig) D2GConfigContainerEngine() string {
	return ""
}

func (c *PublicPlatformConfig) D2GEnabled() bool {
	return false
}
