package main

import (
	"encoding/xml"
	"time"
)

// Used for modelling the xml we get back from Azure
type QueueMessagesList struct {
	XMLName       xml.Name       `xml:"QueueMessagesList"`
	QueueMessages []QueueMessage `xml:"QueueMessage"`
}

// Used for modelling the xml we get back from Azure
type QueueMessage struct {
	XMLName         xml.Name        `xml:"QueueMessage"`
	MessageId       string          `xml:"MessageId"`
	InsertionTime   azureTimeFormat `xml:"InsertionTime"`
	ExpirationTime  azureTimeFormat `xml:"ExpirationTime"`
	DequeueCount    uint            `xml:"DequeueCount"`
	PopReceipt      string          `xml:"PopReceipt"`
	TimeNextVisible azureTimeFormat `xml:"TimeNextVisible"`
	MessageText     string          `xml:"MessageText"`
}

// Used for modelling the json encoding of QueueMessage.MessageId that we get
// back from Azure
type TaskRun struct {
	TaskId string       `json:"taskId"`
	RunId  uint         `json:"runId"`
	QM     QueueMessage `json:"-"`
}

// Custom time format to enable unmarshalling of azure xml directly into go
// object with native go time.Time implementation under-the-hood
type azureTimeFormat struct {
	time.Time
}

// Custom Unmarshaller in order to interpret time formats in the azure expected
// format
func (c *azureTimeFormat) UnmarshalXML(d *xml.Decoder, start xml.StartElement) error {
	const shortForm = "Mon, 2 Jan 2006 15:04:05 MST" // date format of azure xml responses
	var v string
	d.DecodeElement(&v, &start)
	parse, err := time.Parse(shortForm, v)
	*c = azureTimeFormat{parse}
	return err
}

type SignedURLPair struct {
	SignedDeleteUrl string `json:"signedDeleteUrl"`
	SignedPollUrl   string `json:"signedPollUrl"`
}
