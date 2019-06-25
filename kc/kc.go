// Package kc provides functions for encoding/decoding darwin user passwords,
// for use in the /etc/kcpassword file. This is essentially a go port of
// http://www.brock-family.org/gavin/perl/kcpassword.html
package kc

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"os/exec"
)

var (
	MagicKey = []byte{0x7D, 0x89, 0x52, 0x23, 0xD2, 0xBC, 0xDD, 0xEA, 0xA3, 0xB9, 0x1F}
)

func Encode(password []byte) []byte {
	overflow := len(password) % (len(MagicKey) + 1)
	paddingLength := 0
	if overflow > 0 {
		paddingLength = len(MagicKey) + 1 - overflow
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
	pList, err := loginWindowPList()
	if err != nil {
		return
	}
	pList["autoLoginUser"] = user
	var data []byte
	data, err = json.Marshal(&pList)
	if err != nil {
		return
	}
	buf := bytes.NewBuffer(data)
	cmd := exec.Command("/usr/bin/sudo", "/usr/bin/plutil", "-convert", "binary1", "-", "-o", "/Library/Preferences/com.apple.loginwindow.plist")
	cmd.Stdin = buf
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("Error: %v, Output: %v", err, string(output))
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
	pList, err := loginWindowPList()
	if err != nil {
		return "", err
	}
	if user, ok := pList["autoLoginUser"].(string); ok {
		return user, nil
	}
	return "", errors.New("No auto login user")
}

func AutoLoginPassword() (password []byte, err error) {
	encodedPassword, err := ioutil.ReadFile("/etc/kcpassword")
	if err != nil {
		return nil, err
	}
	password = Decode(encodedPassword)
	return
}

func loginWindowPList() (data map[string]interface{}, err error) {
	var loginWindowPListBytes []byte
	loginWindowPListBytes, err = exec.Command("/usr/bin/sudo", "/usr/bin/plutil", "-convert", "json", "/Library/Preferences/com.apple.loginwindow.plist", "-o", "-").CombinedOutput()
	if err != nil {
		return
	}
	err = json.Unmarshal(loginWindowPListBytes, &data)
	return data, err
}
