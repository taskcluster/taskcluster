//go:build multiuser

package gwconfig

type PublicEngineConfig struct {
	EnableRunTaskAsCurrentUser bool `json:"enableRunTaskAsCurrentUser"`
	HeadlessTasks              bool `json:"headlessTasks"`
}
