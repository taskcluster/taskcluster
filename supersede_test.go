package main

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"testing"
	"time"
)

func TestSupersede(t *testing.T) {
	defer setup(t)()

	command := helloGoodbye()

	taskIDs := make([]string, 3)
	// the same as taskIDs, but in the reverse order
	reversedTaskIDs := make([]string, len(taskIDs))

	for i := 0; i < len(taskIDs); i++ {
		payload := GenericWorkerPayload{
			Command:       command,
			MaxRunTime:    30,
			SupersederURL: "http://localhost:52856/TestSupersede",
		}
		td := testTask(t)

		taskIDs[i] = scheduleTask(t, td, payload)
		reversedTaskIDs[len(taskIDs)-1-i] = taskIDs[i]
	}
	serviceResponse := SupersedesServiceResponse{
		TaskIDs: reversedTaskIDs,
	}

	serviceResponseBody, err := json.Marshal(serviceResponse)
	if err != nil {
		t.Fatalf("Could not marshal service response body into json: %v", err)
	}

	// Create custom *http.ServeMux rather than using http.DefaultServeMux, so
	// registered handler functions won't interfere with future tests that also
	// use http.DefaultServeMux.
	supersedeHandler := http.NewServeMux()
	supersedeHandler.HandleFunc("/TestSupersede", func(res http.ResponseWriter, req *http.Request) {
		_, err := res.Write(serviceResponseBody)
		if err != nil {
			t.Fatalf("Mock supersede service could not write http response: %v", err)
		}
	})

	s := http.Server{
		Addr:           "localhost:52856",
		Handler:        supersedeHandler,
		ReadTimeout:    10 * time.Second,
		WriteTimeout:   10 * time.Second,
		MaxHeaderBytes: 1 << 20,
	}

	go s.ListenAndServe()
	defer s.Shutdown(context.Background())

	for _, taskID := range taskIDs {
		t.Logf("Executing task %v", taskID)
		if taskID == reversedTaskIDs[0] {
			ensureResolution(t, taskID, "completed", "completed")
		} else {
			ensureResolution(t, taskID, "exception", "superseded")
			x, _, _, _ := getArtifactContent(t, taskID, "public/superseded-by.json")
			var actualData interface{}
			err = json.Unmarshal(x, &actualData)
			if err != nil {
				t.Fatalf("Error unmarshaling public/superseded-by.json into json: %v", err)
			}
			expectedData := map[string]interface{}{
				"taskId": reversedTaskIDs[0],
			}
			if !reflect.DeepEqual(actualData, expectedData) {
				t.Fatalf("public/superseded-by.json has unexpected content in task %v.\nActual: %#v\nExpected: %#v", taskID, actualData, expectedData)
			}
		}
	}
}

func TestEmptySupersedeList(t *testing.T) {
	defer setup(t)()

	payload := GenericWorkerPayload{
		Command:       helloGoodbye(),
		MaxRunTime:    30,
		SupersederURL: "http://localhost:52856/TestEmptySupersedeList",
	}
	td := testTask(t)

	s := http.Server{
		Addr: ":52856",
	}

	serviceResponseBody, err := json.Marshal(SupersedesServiceResponse{})
	if err != nil {
		t.Fatalf("Could not marshal service response body into json: %v", err)
	}

	http.HandleFunc("/TestEmptySupersedeList", func(res http.ResponseWriter, req *http.Request) {
		_, err := res.Write(serviceResponseBody)
		if err != nil {
			t.Fatalf("Mock supersede service could not write http response: %v", err)
		}
	})

	go s.ListenAndServe()
	defer s.Shutdown(context.Background())

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}
