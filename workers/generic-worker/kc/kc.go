// Package kc provides functions for encoding/decoding darwin user passwords,
// for use in the /etc/kcpassword file. This is essentially a go port of
// http://www.brock-family.org/gavin/perl/kcpassword.html
package kc

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/taskcluster/taskcluster/v95/workers/generic-worker/host"
)

var (
	MagicKey = []byte{0x7D, 0x89, 0x52, 0x23, 0xD2, 0xBC, 0xDD, 0xEA, 0xA3, 0xB9, 0x1F}
)

func Encode(password []byte) []byte {
	overflow := (len(password) + 1) % (len(MagicKey) + 1)
	paddingLength := 1
	if overflow > 0 {
		paddingLength += len(MagicKey) + 1 - overflow
	}
	data := append(password, make([]byte, paddingLength)...)
	for j := range len(data) {
		data[j] ^= MagicKey[j%len(MagicKey)]
	}
	return data
}

func Decode(encoded []byte) []byte {
	data := make([]byte, len(encoded))
	for j := range len(encoded) {
		data[j] = encoded[j] ^ MagicKey[j%len(MagicKey)]
		if data[j] == 0 {
			return data[:j]
		}
	}
	return data
}

func SetAutoLogin(user string, password []byte) (err error) {
	err = host.Run("defaults", "write", "/Library/Preferences/com.apple.loginwindow", "autoLoginUser", "-string", user)
	if err != nil {
		return fmt.Errorf("error setting autoLoginUser: %v", err)
	}
	err = host.Run("defaults", "write", "/Library/Preferences/com.apple.loginwindow", "autoLoginUserScreenLocked", "-bool", "false")
	if err != nil {
		return fmt.Errorf("error setting autoLoginUserScreenLocked: %v", err)
	}
	encodedPassword := Encode(password)
	return os.WriteFile("/etc/kcpassword", encodedPassword, 0600)
}

func AutoLoginUser() (user string, password []byte, err error) {
	user, err = AutoLoginUsername()
	if err != nil {
		return
	}
	password, err = AutoLoginPassword()
	return
}

func AutoLoginUsername() (user string, err error) {
	output, err := host.Output("defaults", "read", "/Library/Preferences/com.apple.loginwindow", "autoLoginUser")
	if err != nil {
		return "", fmt.Errorf("error reading autoLoginUser: %v", err)
	}
	// remove last char (\n) from string
	return output[:len(output)-1], nil
}

func AutoLoginPassword() (password []byte, err error) {
	encodedPassword, err := os.ReadFile("/etc/kcpassword")
	if err != nil {
		return nil, err
	}
	password = Decode(encodedPassword)
	return
}

func LoginWindowPList() (data map[string]any, err error) {
	loginWindowPListString, err := host.Output("/usr/bin/plutil", "-convert", "json", "/Library/Preferences/com.apple.loginwindow.plist", "-o", "-")
	if err != nil {
		return data, err
	}
	err = json.Unmarshal([]byte(loginWindowPListString), &data)
	return data, err
}
