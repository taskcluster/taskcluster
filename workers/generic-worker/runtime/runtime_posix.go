// +build darwin linux

package runtime

type OSUser struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}
