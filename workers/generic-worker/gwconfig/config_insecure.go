//go:build insecure

package gwconfig

type PublicEngineConfig struct {
}

func DefaultPublicEngineConfig() *PublicEngineConfig {
	return &PublicEngineConfig{}
}
