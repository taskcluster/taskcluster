// Package version implements the version subcommand.
package version

import (
    "fmt"
    "io/ioutil"
    "net/http"
    "encoding/json"
    "runtime"		
	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster/clients/client-shell/cmds/root"
)


// Useful structure for assets[] in the returned json data 
type Assets struct {
    Download string                  `json:"browser_download_url"`
   }
  
   // Useful structure in the returned json data 
  
  type Release struct {
      Name string                    `json:"name"`
      Asslist []Assets                `json:"assets"`
     }
  
 
 var (
      // Command is the cobra command to check for update and update.
      Updcommand = &cobra.Command{
          Use:   "update",
          Short: "Updates Taskcluster",
          Run:  check,
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
	VersionNumber = "24.1.10"
)

func init() {
	root.Command.AddCommand(Command)
	root.Command.AddCommand(Updcommand)
}


func printVersion(cmd *cobra.Command, _ []string) {
	fmt.Fprintf(cmd.OutOrStdout(), "taskcluster version %s\n", VersionNumber)
}

func check(cmd *cobra.Command, _ []string) {

    //Get response and also check for error in  from git's REST API

    response, err := http.Get ("https://api.github.com/repos/taskcluster/taskcluster/releases/latest") 

    if err != nil {
        fmt.Print(err.Error())
        
    }

    // Read the whole response body and check for any errors


    s, err := ioutil.ReadAll(response.Body)
    
    if err != nil {
        fmt.Errorf(err.Error())
        
    }

    //Create an object for the struct to parse the json data into given structure
    
    R := Release{}
    if err := json.Unmarshal([]byte(s), &R); err != nil {
        fmt.Errorf(err.Error())
    }

    //Check if taskcluster is already up to date

	if R.Name == "v"+VersionNumber {
       
        fmt.Printf("taskcluster is already updated")
    
    
    } else {
    if runtime.GOOS == "linux" {
    fmt.Printf(R.Asslist[1].Download)
  

    }
    if runtime.GOOS == "darwin"{
    fmt.Printf(R.Asslist[0].Download)
                                }
        }

		
     }
    
    
		
    
