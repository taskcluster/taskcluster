//go:build multiuser
// +build multiuser

package gwconfig

type PublicEngineConfig struct {
	RunTasksAsCurrentUser bool `json:"runTasksAsCurrentUser"`
}
