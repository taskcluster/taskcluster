// Package kc provides functions for encoding/decoding darwin user passwords,
// for use in the /etc/kcpassword file. This is essentially a go port of
// http://www.brock-family.org/gavin/perl/kcpassword.html
package kc

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os/exec"
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
	data := append(password, make([]byte, paddingLength, paddingLength)...)
	for j := 0; j < len(data); j++ {
		data[j] ^= MagicKey[j%len(MagicKey)]
	}
	return data
}

func Decode(encoded []byte) []byte {
	data := make([]byte, len(encoded), len(encoded))
	for j := 0; j < len(encoded); j++ {
		data[j] = encoded[j] ^ MagicKey[j%len(MagicKey)]
		if data[j] == 0 {
			return data[:j]
		}
	}
	return data
}

func SetAutoLogin(user string, password []byte) (err error) {
	output, err := exec.Command("defaults", "write", "/Library/Preferences/com.apple.loginwindow", "autoLoginUser", "-string", user).CombinedOutput()
	if err != nil {
		return fmt.Errorf("Error setting autoLoginUser: %v, Output: %v", err, string(output))
	}
	output, err = exec.Command("defaults", "write", "/Library/Preferences/com.apple.loginwindow", "autoLoginUserScreenLocked", "-bool", "false").CombinedOutput()
	if err != nil {
		return fmt.Errorf("Error setting autoLoginUserScreenLocked: %v, Output: %v", err, string(output))
	}
	encodedPassword := Encode(password)
	return ioutil.WriteFile("/etc/kcpassword", encodedPassword, 0600)
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
	output, err := exec.Command("defaults", "read", "/Library/Preferences/com.apple.loginwindow", "autoLoginUser").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("Error reading autoLoginUser: %v, Output: %v", err, string(output))
	}
	// remove last char (\n) from string
	return string(output[:len(output)-1]), nil
}

func AutoLoginPassword() (password []byte, err error) {
	encodedPassword, err := ioutil.ReadFile("/etc/kcpassword")
	if err != nil {
		return nil, err
	}
	password = Decode(encodedPassword)
	return
}

func LoginWindowPList() (data map[string]interface{}, err error) {
	var loginWindowPListBytes []byte
	loginWindowPListBytes, err = exec.Command("/usr/bin/sudo", "/usr/bin/plutil", "-convert", "json", "/Library/Preferences/com.apple.loginwindow.plist", "-o", "-").CombinedOutput()
	if err != nil {
		return
	}
	err = json.Unmarshal(loginWindowPListBytes, &data)
	return data, err
}
