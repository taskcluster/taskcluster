package version

import (
    "fmt"
    "io/ioutil"
    "net/http"
    "runtime"
    "encoding/json"
    "github.com/spf13/cobra"
    "github.com/taskcluster/taskcluster/clients/client-shell/config"
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
		Short: "Checks if taskcluster is up to date , else returns the download link respective to the OS",
		Run:  check,
	}

)


func init() {
    // the update command 
	Command.AddCommand(Updcommand)
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

	if R.Name == VersionNumber {
       
        fmt.Println("taskcluster version  %s is already updated\n", VersionNumber)
    
    
    } else {

    if runtime.GOOS == "linux" {
    fmt.Println(R.Asslist[1].Download)
  

    }
    if runtime.GOOS == "darwin"{
    fmt.Println(R.Asslist[0].Download)
                                }
        }

		
     }

    
    
		
    

