package exchange

import (
	"encoding/json"
	//	"github.com/streadway/amqp"
	"reflect"
	"strings"
)

type TaskDefined struct {
	RoutingKeyKind string `mwords:"*"`
	TaskId         string `mwords:"*"`
	RunId          string `mwords:"*"`
	WorkerGroup    string `mwords:"*"`
	WorkerId       string `mwords:"*"`
	ProvisionerId  string `mwords:"*"`
	WorkerType     string `mwords:"*"`
	SchedulerId    string `mwords:"*"`
	TaskGroupId    string `mwords:"*"`
	Reserved       string `mwords:"#"`
}

type TaskClusterMessage struct {
	Status  json.RawMessage `json:"status"`
	Version uint            `json:"version"`
}

// func X(f func(interface{}), o interface{}) func(d amqp.Delivery) {
// 	return func(d amqp.Delivery) {
// 		message := new(exchange.TaskClusterMessage)
// 		err := json.Unmarshal(d.Body, message)
// 		if err != nil {
// 			panic(err)
// 		}
// 		json.Unmarshal(message.Status, o)
// 		if err != nil {
// 			panic(err)
// 		}
// 		return f(o)
// 	}
// }

func (x TaskDefined) RoutingKey() string {
	return generateRoutingKey(&x)
}

func (x TaskDefined) ExchangeName() string {
	return "exchange/taskcluster-queue/v1/task-defined"
}

func generateRoutingKey(x *TaskDefined) string {
	val := reflect.ValueOf(x).Elem()
	p := make([]string, 0, val.NumField())
	for i := 0; i < val.NumField(); i++ {
		valueField := val.Field(i)
		typeField := val.Type().Field(i)
		tag := typeField.Tag
		if t := tag.Get("mwords"); t != "" {
			if v := valueField.Interface(); v == "" {
				p = append(p, t)
			} else {
				p = append(p, v.(string))
			}
		}
	}
	return strings.Join(p, ".")
}
