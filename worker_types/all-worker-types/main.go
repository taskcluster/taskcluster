package main

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/taskcluster/taskcluster-client-go/tcawsprovisioner"
)

type WorkerTypeFetcher struct {
	Provisioner       *tcawsprovisioner.AwsProvisioner
	RequestChannel    <-chan string
	DownloadDirectory string
	ProcessedChannel  chan<- string
}

type WorkerPool struct {
	Workers   []*WorkerTypeFetcher
	WaitGroup sync.WaitGroup
}

func main() {
	prov := tcawsprovisioner.NewFromEnv()
	downloadDirectory := "worker_type_definitions"
	requestChannel := make(chan string)
	processedChannel := make(chan string)
	_ = NewWorkerPool(20, requestChannel, processedChannel, prov, downloadDirectory)
	allWorkerTypes, err := prov.ListWorkerTypes()
	if err != nil {
		panic(err)
	}
	err = os.MkdirAll(downloadDirectory, 0755)
	if err != nil {
		panic(err)
	}
	go func() {
		defer close(requestChannel)
		for _, workerType := range *allWorkerTypes {
			requestChannel <- workerType
		}
	}()
	for completedWorkerType := range processedChannel {
		fmt.Println(completedWorkerType)
	}
}

func NewWorkerPool(capacity int, requestChannel <-chan string, processedChannel chan<- string, prov *tcawsprovisioner.AwsProvisioner, downloadDirectory string) *WorkerPool {
	wp := &WorkerPool{}
	wp.WaitGroup.Add(capacity)
	wp.Workers = make([]*WorkerTypeFetcher, capacity, capacity)
	for i := 0; i < capacity; i++ {
		wp.Workers[i] = &WorkerTypeFetcher{
			Provisioner:       prov,
			RequestChannel:    requestChannel,
			DownloadDirectory: downloadDirectory,
			ProcessedChannel:  processedChannel,
		}
		go func(i int) {
			wp.Workers[i].FetchUntilDone(&wp.WaitGroup)
		}(i)
	}
	go func() {
		wp.WaitGroup.Wait()
		close(processedChannel)
	}()
	return wp
}

func (wtf *WorkerTypeFetcher) FetchUntilDone(wg *sync.WaitGroup) {
	for workerType := range wtf.RequestChannel {
		err := wtf.fetch(workerType)
		if err != nil {
			panic(err)
		}
	}
	wg.Done()
}

func (wtf *WorkerTypeFetcher) fetch(workerType string) (err error) {
	var u *url.URL
	u, err = wtf.Provisioner.WorkerType_SignedURL(workerType, time.Minute)
	if err != nil {
		return
	}
	var resp *http.Response
	resp, err = http.Get(u.String())
	if err != nil {
		return
	}
	defer func() {
		if err == nil {
			err = resp.Body.Close()
		} else {
			resp.Body.Close()
		}
	}()
	var file *os.File
	file, err = os.Create(filepath.Join(wtf.DownloadDirectory, workerType))
	if err != nil {
		return
	}
	defer func() {
		if err == nil {
			err = file.Close()
		} else {
			file.Close()
		}
	}()
	io.Copy(file, resp.Body)
	wtf.ProcessedChannel <- workerType
	return
}
