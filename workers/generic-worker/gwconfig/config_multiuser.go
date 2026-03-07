package gwconfig

type PublicEngineConfig struct {
	EnableRunTaskAsCurrentUser bool `json:"enableRunTaskAsCurrentUser"`
	HeadlessTasks              bool `json:"headlessTasks"`
}

func DefaultPublicEngineConfig() *PublicEngineConfig {
	return &PublicEngineConfig{
		EnableRunTaskAsCurrentUser: true,
	}
}
