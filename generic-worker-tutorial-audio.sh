#!/bin/bash

say -v Samantha "Hello guys, this is Peter Moore from the task cluster team. Today I will be talking to you about the Task Cluster generic worker."
sleep 2
say -v Samantha "The generic worker currently supports running tasks under Windows. This is in contrast to the docker worker, which is used for running tasks under linux."
sleep 1
say -v Samantha "The purpose of this tutorial is to dive straight in, to see how to create a task to run on the generic worker via the Task Creator."
sleep 1
say -v Samantha "Please see the other tutorials in this series for related topics, such as:"
sleep 0.5
say -v Daniel "how to create a new windows A M I [[slnc 50]] to run your task cluster tasks"
sleep 1.3
say -v Daniel "how to set up a new worker type that uses your new windows A M I"
sleep 0.5
say -v Samantha "This talk simply shows how to manually trigger a windows task via the Task Creator."
sleep 1.5
say -v Karen "So guys, without further ado, let's open up the Task Creator."
sleep 3
say -v Samantha "tools dot taskcluster dot net [[slnc 200]] offers an array of tools which can be used to interface with Taskcluster."
say -v Samantha "Please note that these tools are simple web interfaces around the formal APIs that Taskcluster exposes. These APIs can also be called programmatically."
sleep 1
say -v Samantha "Therefore anything you can do via tools dot taskcluster dot net, you can also automate."
say -v Samantha "Please see the separate talk on "
say -v "Pipe Organ" "Taskcluster Clients"
say -v Daniel "Did you say Taskcluster Clients?"
say -v "Pipe Organ" "yes"
say -v Samantha "to find out how you can interact with Taskcluster APIs from your own programs."
sleep 1
say -v Samantha "Let's jump straight in, and go to the Task Creator."
sleep 2
say -v Daniel "The Task Creator provides a simple way to create a task definition and submit it to Taskcluster."
sleep 1
say -v Daniel "By default, the Task Creator will provide you with the following Task Definition."
sleep 3
say -v Karen "This default task prints Hello World, but it is designed to run on the B2G test worker."
sleep 1
say -v Samantha "The b2g test worker is not a generic worker. The b2g test worker is a linux docker worker, so we need to change this."
sleep 2
say -r 50 -v Trinoids "win 2008 [[slnc 300]] r [[slnc 50 ]] toooo [[slnc 200]] hyphen [[slnc 200]] v1"
sleep 1
say -v Daniel "The win 2008 r toooo hyphen v1 worker is a basic worker type that Pete set up which can build go executables"
sleep 1
say -v Karen "You can think of a worker type as a virtual machine definition."
sleep 0.5
say -v Daniel "Each worker type specifies an A M I to use, which is essentially a snapshot of a virtual machine."
sleep 0.5
say -v Samantha "The win 2008 r toooo hyphen v1 worker type was created by spawning a Windows 2008 server machine in Amazon, applying some changes, snapshotting it, creating an A M I from the snapshot, and then creating a worker type in the taskcluster provisioner that uses this A M I."
sleep 0.5
say -v Daniel "So if the worker type represents a Windows 2008 server with some changes, what changes did you make, Pete?"
sleep 1
say -v Samantha "I installed the generic worker as a Windows Service, and installed the go compiler."
sleep 2
say -v Karen "The go compiler was installed so that the worker can build go code. This is what we are going to do in this demo."
say -v Samantha "Please note the go compiler could also have been installed as part of the task definition, but it would then need to happen every time a task is run. By installing the go compiler on the A M I used by the worker type, it is readily available for any task that might need it."
sleep 2
say -v Daniel "Great, that makes a lot of sense. Thanks for explaining, Pete"
sleep 1
say -v Samantha "You're welcome."
say -v Hysterical "Oh my god you guys are crazy"
sleep 1
say -v Karen "So guys, we've covered the worker type, but what is the provisioner I D that I see on the first line?"
say -v Daniel "The provisioner I D is used to specify which provisioner should take care of creating workers. At the moment we only have A W S provisioner-v1, so you should use that."
say -v Karen "OK"
sleep 0.5
say -v Samantha "The created and deadline fields are populated by the task creator with sensible values, let's leave them as they are."
say -v Daniel "Yeah"
say -v Karen "That seems to just leave payload and metadata sections. What are they?"
say -v Daniel "You mean Meta data"
say -v Karen "Metadata"
say -v Daniel "Meta data"
say -v Karen "Metadata"
say -v Samantha "Never mind"
say -v Daniel "The payload defines what the task should do. Inside payload you see there is a property called command. The command property provides the docker worker with an array of strings representing a single command to run. Each string is an argument of the command."
say -v Karen "Is that the same format that the generic worker expects?"
say -v "Pipe Organ" "No"
say -v Karen "Who was that?"
say -v "Pipe Organ" "Sorry"
say -v Daniel "The generic worker is different. It expects a list of commands, where each command is represented by a single string. You can think of each string as being a line in a Windows batch file. Therefore if you want to run 5 commands, you would supply 5 strings; one for each line of the batch file."
sleep 2
say -v Karen "OK"
sleep 1
say -v Daniel "You seemed to pause there, are you confused?"
say -v Karen "A little."
say -v Daniel "OK, let's put some commands in"
sleep 1
say -v Daniel -r 50 "set"
sleep 2
say -v Daniel -r 50 "make directory go path"
sleep 2
say -v Daniel -r 50 "set go path equals percent C D percent backslash backslash go path"
say -v Samantha "The double backslash is simply to escape the backslash as required by the jason data format"
say -v Karen "Oh that is interesting"
say -v Daniel -r 50 "go get git hub dot com slash task cluster slash generic worker"
say -v Karen "Did you say git hub?"
say -v Daniel "yes"
say -v Veena "He means git hub"
say -v Hysterical "haaa"
sleep 2
say -v Daniel -r 50 "go install github doc com slash task cluster slash generic worker"
