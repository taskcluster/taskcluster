//go:build darwin || linux || freebsd

package runtime

type OSUser struct {
	Name     string `json:"name"`
	Password string `json:"password"`
	// ReuseIDs makes CreateNew on darwin give the user the lowest free UID and
	// a GeneratedUID derived from it.
	ReuseIDs bool `json:"-"`
}
