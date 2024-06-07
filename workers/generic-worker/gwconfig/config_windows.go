package gwconfig

import "testing"

type PublicPlatformConfig struct {
	EnableInteractive        bool `json:"enableInteractive"`
	EnableRDP                bool `json:"enableRDP"`
	EnableRunAsAdministrator bool `json:"enableRunAsAdministrator"`
}

func DefaultPublicPlatformConfig() *PublicPlatformConfig {
	return &PublicPlatformConfig{
		EnableInteractive:        true,
		EnableRDP:                true,
		EnableRunAsAdministrator: true,
	}
}

func (c *PublicPlatformConfig) D2GEnabled() bool {
	return false
}

// Helper method used to enable D2G
// during testing. Does nothing on Windows.
func (c *PublicPlatformConfig) EnableD2G(t *testing.T) {
	t.Helper()
}

func (c *PublicPlatformConfig) NativePayloadsDisabled() bool {
	return false
}

func (c *PublicPlatformConfig) LogD2GTranslation() bool {
	return false
}
