// +build darwin

package azure

import (
	"errors"
)

func (mds *realMetadataService) loadCustomData() ([]byte, error) {
	return []byte{}, errors.New("Azure customdata not implemented for macOS")
}
