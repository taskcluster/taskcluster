package main

import (
    "encoding/json"
    "io/ioutil"
    "fmt"
)

func main() {
    var f interface{}
    bytes, err := ioutil.ReadFile("apis.json")
    if err != nil {
        fmt.Println(err)
    }
    err = json.Unmarshal(bytes, &f)
    fmt.Printf("Result: %v", f)
}