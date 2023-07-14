package gdm3

import (
	"encoding/json"
	"os"
)

// TODO: dirty hack to return expected logged in user, until we gnome desktop running in real freebsd worker pools
func InteractiveUsername() (string, error) {
	credsFile, err := os.Open("current-task-user.json")
	if err != nil {
		return "", err
	}
	defer func() {
		credsFile.Close()
	}()
	decoder := json.NewDecoder(credsFile)
	decoder.DisallowUnknownFields()
	user := map[string]string{}
	err = decoder.Decode(&user)
	if err != nil {
		panic(err)
	}
	return user["name"], nil
}
