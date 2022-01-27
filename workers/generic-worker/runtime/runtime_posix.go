//go:build darwin || linux || freebsd

package runtime

type OSUser struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}
