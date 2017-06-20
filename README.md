# webhooktunnel
--
[![Task Status](https://github.taskcluster.net/v1/repository/taskcluster/webhooktunnel/master/badge.svg)](https://github.taskcluster.net/v1/repository/taskcluster/webhooktunnel/master/latest)

TaskCluster workers are hosted on services such as EC2 and currently expose ports to the internet to allow http-clients to call API endpoints. This setup may not be feasible in a data center setup. Webhooktunnel aims to mitigate this problem by allowing workers to connect to the proxy over an outgoing websocket connection and exposing API endpoints to the internet. Any incoming requests will be reverse proxied to the worker over its outgoing connection. 
