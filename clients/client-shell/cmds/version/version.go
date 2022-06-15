// Package version implements the version subcommand.
package version

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"runtime"
	s "strings"

	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster/v44/clients/client-shell/cmds/root"
)

// Asset describes a download url for a published releases.
type Asset struct {
	Download string `json:"browser_download_url"`
}

// Release provided through GitHub for new tc-client shells
type Release struct {
	Name    string  `json:"name"`
	Assets  []Asset `json:"assets"`
	Message string  `json:"message"`
}

var (
	// Updcommand  is the cobra command to check for a new update.
	Updcommand = &cobra.Command{
		Use:   "update",
		Short: "Updates Taskcluster",
		Run:   update,
	}
)

var (
	// Command is the cobra command representing the version subtree.
	Command = &cobra.Command{
		Use:   "version",
		Short: "Prints the Taskcluster version.",
		Run:   printVersion,
	}

	// VersionNumber is a formatted string with the version information. This is
	// filled in by `yarn release`
	VersionNumber = "44.16.3"
)

var log = root.Logger

func init() {
	root.Command.AddCommand(Command)
	root.Command.AddCommand(Updcommand)
}

func printVersion(cmd *cobra.Command, _ []string) {
	fmt.Fprintf(cmd.OutOrStdout(), "taskcluster version %s\n", VersionNumber)
}

func update(cmd *cobra.Command, _ []string) {
	// Check for a new version and report download url.
	response, err := http.Get("https://api.github.com/repos/taskcluster/taskcluster/releases/latest")
	if err != nil {
		log.Error(err)
	}

	// Read the whole response body and check for any errors
	body, err := ioutil.ReadAll(response.Body)
	if err != nil {
		log.Errorln(err)
	}

	// Create an object for the struct to parse the json data into given structure
	R := Release{}
	if err := json.Unmarshal([]byte(body), &R); err != nil {
		log.Errorln(err)
	}

	if s.Contains(R.Message, "API rate limit") {
		log.Errorln("taskcluster update: GitHub API Rate limit exceeded")
		return
	}
	// Check if taskcluster is already up to date. The published
	// version shouldn't go backwards, so equality check is fine.
	if R.Name == "v"+VersionNumber {
		log.Errorln("taskcluster is already on the most recent version.")
	} else {
		for _, asset := range R.Assets {
			if s.Contains(asset.Download, runtime.GOOS) {
				fmt.Fprintf(cmd.OutOrStdout(), "# %s\n", asset.Download)
				fmt.Fprintf(cmd.OutOrStdout(), "curl -L %s -o taskcluster\n", asset.Download)
				return
			}
		}
	}
	fmt.Fprintf(cmd.OutOrStdout(), "No update available for %s\n", runtime.GOOS)
}
