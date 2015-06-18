package main

import (
	"io/ioutil"
)

// Creates a powershell script file with the given filename, that can be used
// to execute a command as a different user. The powershell script takes 4
// positional arguments: the windows username, password, the script to run, and
// the working directory to run from. Returns an error if there is a problem
// creating the script.
func createRunAsUserScript(filename string) error {
	scriptContents := "$username = $args[0]\r\n"
	scriptContents += "$password = $args[1]\r\n"
	scriptContents += "$script = $args[2]\r\n"
	scriptContents += "$dir = $args[3]\r\n"
	scriptContents += "\r\n"
	scriptContents += "$credentials = New-Object System.Management.Automation.PSCredential -ArgumentList @($username,(ConvertTo-SecureString -String $password -AsPlainText -Force))\r\n"
	scriptContents += "\r\n"
	scriptContents += "Start-Process $script -WorkingDirectory $dir -Credential ($credentials) -Wait\r\n"
	return ioutil.WriteFile(filename, []byte(scriptContents), 0755)
}
