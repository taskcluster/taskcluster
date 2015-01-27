package main

import (
	"flag"
	"fmt"
	"github.com/petemoore/taskcluster-client-go/model"
	"github.com/petemoore/taskcluster-client-go/utils"
	"io/ioutil"
	"log"
	"strings"
)

var (
	err error
)

func main() {
	endpoints := flag.String("f", "", "the json file to load which defines all the api endpoints to parse")
	flag.Parse()
	if *endpoints == "" {
		log.Fatal("Please specify a json file to load the api endpoints from with -f option")
	}
	var bytes []byte
	bytes, err = ioutil.ReadFile(*endpoints)
	if err != nil {
		fmt.Printf("Could not load json file '%v'!\n", *endpoints)
	}
	utils.ExitOnFail(err)
	apis, schemas := model.LoadAPIs(bytes)
	fmt.Println("\n\n")
	for _, api := range apis {
		fmt.Println(api.URL)
		fmt.Println(strings.Repeat("=", len(api.URL)))
		fmt.Println(api.Data)
		fmt.Println()
	}
	for i, schema := range schemas {
		fmt.Println(i)
		fmt.Println(strings.Repeat("=", len(i)))
		fmt.Println(*schema)
		fmt.Println()
	}
	fmt.Println("All done.")
}
