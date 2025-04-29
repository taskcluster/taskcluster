//go:build darwin || freebsd

package gwconfig

import "testing"

type PublicPlatformConfig struct {
}

func DefaultPublicPlatformConfig() *PublicPlatformConfig {
	return &PublicPlatformConfig{}
}

func (c *PublicPlatformConfig) D2GEnabled() bool {
	return false
}

// Helper method used to enable D2G
// during testing. Does nothing on Darwin or FreeBSD.
func (c *PublicPlatformConfig) EnableD2G(t *testing.T) {
	t.Helper()
}

func (c *PublicPlatformConfig) NativePayloadsDisabled() bool {
	return false
}

func (c *PublicPlatformConfig) LogD2GTranslation() bool {
	return false
}
