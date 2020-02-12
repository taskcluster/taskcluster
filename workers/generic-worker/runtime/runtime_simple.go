// +build simple

package runtime

import "errors"

func (user *OSUser) Create(okIfExists bool) error {
	return errors.New("Not yet implemented - cannot create users on linux yet...")
}
