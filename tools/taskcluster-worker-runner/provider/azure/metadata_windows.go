// +build windows

package azure

import (
	"io/ioutil"
	"os"
)

var customDataPath = os.Getenv("SYSTEMDRIVE") + "\\AzureData\\CustomData.bin"

func (mds *realMetadataService) loadCustomData() ([]byte, error) {
	dat, err := ioutil.ReadFile(customDataPath)
	if err != nil {
		return []byte{}, err
	}
	return dat, nil
}
