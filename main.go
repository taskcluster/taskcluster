package main

import (
	"fmt"
	"github.com/taskcluster/taskcluster-client-go/queue"
	// "github.com/taskcluster/taskcluster-client-go/queueevents"
	"encoding/xml"
	"log"
	"net/http"
	"os"
	"time"
)

type QueueMessagesList struct {
	XMLName       xml.Name       `xml:"QueueMessagesList"`
	QueueMessages []QueueMessage `xml:"QueueMessage"`
}

type QueueMessage struct {
	XMLName         xml.Name `xml:"QueueMessage"`
	MessageId       string   `xml:"MessageId"`
	InsertionTime   string   `xml:"InsertionTime"`
	ExpirationTime  string   `xml:"ExpirationTime"`
	PopReceipt      string   `xml:"PopReceipt"`
	TimeNextVisible string   `xml:"TimeNextVisible"`
	DequeueCount    string   `xml:"DequeueCount"`
	MessageText     string   `xml:"MessageText"`
}

func main() {
	Queue := queue.New(os.Getenv("TASKCLUSTER_CLIENT_ID"), os.Getenv("TASKCLUSTER_ACCESS_TOKEN"))
	poll, _ := Queue.PollTaskUrls("azure-provisioner", "generic-worker")
	exp := poll.Expires
	queues := poll.Queues
	fmt.Printf("Expires: %v\n", exp.String())
	fmt.Printf("%v url pairs given, trying them in order...\n", len(queues))
	for _, q := range queues {
		queueMessagesList := new(QueueMessagesList)
		delUrl := q.SignedDeleteUrl
		pollUrl := q.SignedPollUrl
		fmt.Println("  Delete URL: " + delUrl)
		fmt.Println("  Poll URL:   " + pollUrl)
		// retry poll url maximum of 5 times, in case of intermittent issues
		// with exponential drop off of 1s, 2s, 4s, 8s, 16s...
		for attempts := uint(0); attempts < 5; attempts++ {
			resp, err := http.Get(pollUrl)
			if err == nil {
				dec := xml.NewDecoder(resp.Body)
				err = dec.Decode(&queueMessagesList)
				if err == nil {
					fmt.Printf("    %v of type %T\n", queueMessagesList, queueMessagesList)
					break
				}
			}
			log.Printf("    %v\n", err)
			log.Printf("    Sleeping %v seconds...\n", 1<<attempts)
			time.Sleep(time.Second << attempts)
		}
		if len(queueMessagesList.QueueMessages) == 0 {
			fmt.Println("  0 queue messages returned, trying next url in the list...")
		} else {
			fmt.Println("  Messages returned in queue, exiting loop...")
			break
		}
	}
}
