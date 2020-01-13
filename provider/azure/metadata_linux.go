// +build linux

package azure

import (
	"encoding/base64"
	"encoding/xml"
	"io/ioutil"
)

type OvfEnv struct {
	XMLName             xml.Name            `xml:"Environment"`
	ProvisioningSection ProvisioningSection `xml:"ProvisioningSection"`
}

type ProvisioningSection struct {
	XMLName                           xml.Name                          `xml:"ProvisioningSection"`
	LinuxProvisioningConfigurationSet LinuxProvisioningConfigurationSet `xml:"LinuxProvisioningConfigurationSet"`
}

type LinuxProvisioningConfigurationSet struct {
	XMLName    xml.Name `xml:"LinuxProvisioningConfigurationSet"`
	CustomData string   `xml:"CustomData"`
}

// We believe this file is https://www.dmtf.org/standards/ovf
// but mostly we've just made this work with this file copied from a running
// vm so this might not be foolproof
var customDataPath = "/var/lib/waagent/ovf-env.xml"

func (mds *realMetadataService) loadCustomData() ([]byte, error) {
	dat, err := ioutil.ReadFile(customDataPath)
	if err != nil {
		return []byte{}, err
	}

	d := &OvfEnv{}
	err = xml.Unmarshal([]byte(dat), d)
	if err != nil {
		return []byte{}, err
	}

	decoded, err := base64.StdEncoding.DecodeString(d.ProvisioningSection.LinuxProvisioningConfigurationSet.CustomData)
	if err != nil {
		return []byte{}, err
	}

	return decoded, nil
}
