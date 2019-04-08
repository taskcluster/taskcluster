// +build !windows

package runtime

type OSUser struct {
	HomeDir  string
	Name     string
	Password string
}
