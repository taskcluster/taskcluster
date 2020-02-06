package main

import (
	"fmt"
	"os"
	"time"

	"github.com/taskcluster/taskcluster-client-go/tcgithub"
)

func main() {
	startTime := time.Now()
	myGithub := tcgithub.NewFromEnv()
	ct := ""
	status := ""
outer:
	for status != "failed" {
		fmt.Printf("Querying revision %v...\n", os.Args[1])
		b, err := myGithub.Builds(ct, "20", "mozilla-releng", "OpenCloudConfig", os.Args[1])
		fmt.Printf("Result: %#v\n", b)
		if err != nil {
			panic(err)
		}
		if len(b.Builds) > 1 {
			panic(fmt.Sprintf("Too many builds! %#v", b))
		}
		if len(b.Builds) == 1 {
			build := b.Builds[0]
			switch build.State {
			case "pending":
				fmt.Println("Still pending...")
			case "success":
				fmt.Println("Job completed successfully")
				break outer
			case "error":
				panic(fmt.Sprintf("Error! %#v", b))
			case "failure":
				panic(fmt.Sprintf("Failure! %#v", b))
			}
		}
		if time.Now().After(startTime.Add(time.Hour * 3)) {
			panic("Timed out!")
		}
		time.Sleep(10 * time.Second)
	}
}
