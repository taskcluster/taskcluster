//go:build insecure

package runtime

import "errors"

func (user *OSUser) Create(okIfExists bool) error {
	return errors.New("not yet implemented - cannot create users on linux yet")
}
