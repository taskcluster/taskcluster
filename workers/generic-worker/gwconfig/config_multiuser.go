// +build multiuser

package gwconfig

type PublicEngineConfig struct {
	HeadlessTasks         bool `json:"headlessTasks"`
	RunTasksAsCurrentUser bool `json:"runTasksAsCurrentUser"`
}
