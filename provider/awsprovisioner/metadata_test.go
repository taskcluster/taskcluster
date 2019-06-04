package awsprovisioner

import "fmt"

type fakeMetadataService struct {
	UserDataError error
	UserData      *UserData
	Metadata      map[string]string
}

func (mds *fakeMetadataService) queryUserData() (*UserData, error) {
	if mds.UserDataError != nil {
		return nil, mds.UserDataError
	}
	return mds.UserData, nil
}

func (mds *fakeMetadataService) queryMetadata(path string) (string, error) {
	if path[0] != '/' {
		panic("path must start with /")
	}
	res, ok := mds.Metadata[path]
	if !ok {
		return "", fmt.Errorf("not found")
	}
	return res, nil
}

// TODO: test the real metadata service
