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
say -v Samantha "tools dot task cluster dot net [[slnc 200]] offers an array of tools which can be used to interface with Taskcluster."
say -v Samantha "Please note that these tools are simple web interfaces around the formal APIs that Taskcluster exposes. These APIs can also be called programmatically."
sleep 1
say -v Samantha "Therefore anything you can do via tools dot task cluster dot net, you can also automate."
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
say -v Samantha "The win 2008 r toooo hyphen v1 worker type was created by spawning a Windows 2008 server machine in Amazon, applying some changes, snapshotting it, creating an A M I from the snapshot, and then creating a worker type in the task cluster provisioner that uses this A M I."
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
say -v Karen "What does that do?"
say -v Samantha "That will output all of the environment variables"
say -v Karen "Nice"
sleep 2
say -v Daniel -r 50 "make directory go path"
sleep 2
say -v Daniel -r 50 "set go path equals percent C D percent backslash backslash go path"
say -v Samantha "The double backslash is simply to escape the backslash as required by the jason data format"
say -v Karen "Oh that is interesting"
sleep 2
say -v Daniel -r 50 "go get git hub dot com slash task cluster slash generic worker"
say -v Karen "Did you say git hub?"
say -v Daniel "yes"
say -v Veena "He means git hub"
say -v Hysterical "ha"
sleep 2
say -v Veena -r 50 "go install git hub doc com slash task cluster slash generic worker"
sleep 2
say -v Daniel "I think that should be enough"
say -v Samantha "Let's leave the maxRunTime at 600 seconds - that is ten minutes, and should be plenty"
sleep 2
say -v Karen "Is it possible to set environment variables too?"
say -v Samantha "Yes, we can either do that with a set command like we just did, or like this"
sleep 4
say -v Daniel "Env"
sleep 3
say -v Daniel "Pete"
sleep 3
say -v Daniel "Moore"
sleep 0.5
say -v Samantha "This will set an environment variable called Pete to the value Moore"
say -v Karen "Pete Moore sounds like a nice chap"
say -v "Pipe Organ" "I like him too"
sleep 2
say -v Karen "OK let's finish this all off with some appropriate meta data"
sleep 2
say -v Karen "Name"
sleep 2
say -v Karen "Build generic worker"
sleep 4
say -v Karen "Description"
sleep 2
say -v Karen "This task builds"
sleep 1
say -v Karen "the generic worker"
sleep 1
say -v Karen "from source on Windows 2008 R2"
sleep 2
say -v Karen "and publishes it"
sleep 1
say -v Karen "as an artifact to s3"
sleep 4
say -v Karen "Owner"
sleep 2
say -v Karen "P Moore at mozilla dot com"
sleep 4
say -v Daniel "We can leave the source setting as it is. It just shows that we created the task from the task creator."
sleep 3
say -v Karen "How does task cluster know to keep the executable it built, or upload it somewhere for us?"
sleep 1
say -v Samantha "Indeed, we need to tell task cluster to keep the generated artifact for us, let's do this now"
sleep 4
say -v Daniel "artifacts"
sleep 2
say -v Samantha "This is a list, so we need to use square brackets here"
sleep 1
say -v Karen "Each artifact is an object so we also need curly brackets here too"
sleep 1
say -v Daniel "Type"
sleep 2
say -v Samantha "File"
sleep 1
say -v Karen "This is the only supported type at the moment, currently directory is not supported"
sleep 2
say -v Daniel "Path"
sleep 2
say -v Samantha "GoPath [[slnc 200]] slash [[slnc 200]] bin [[slnc 200]] slash [[slnc 200]] generic hyphen worker [[slnc 200]] dot e x e"
sleep 2
say -v Daniel "Expires"
sleep 1
say -v Samantha "Let's set it to Pete's 38th birthday."
sleep 1
say -v Samantha "2015 [[slnc 200]] hyphen zero eight [[slnc 200]] hyphen one nine [[slnc 200]] capital T [[slnc 200]] seventeen [[slnc 200]] colon thirty [[slnc 200]] colon zero zero [[slnc 200]] dot [[slnc 200]] zero zero zero [[slnc 200]] capital Z"
sleep 3
say -v Daniel "Notice that the task creator validates the jason syntax as you type, so you can only submit valid jason data"
say -v Samantha "OK guys, let's run this thing"
say -v Daniel "Yay"
say -v "Pipe Organ" "wooo"
say -v Karen "Blistering barnacles"
say -v Veena "I'd like a bit of that"
sleep 5
say -v Samantha "As you can see this task is running now"
say -v Karen "If we click on the Run zero tab, we can see the log files appear"
say -v Daniel "There will be one log file per command specified. Since we specified 5 commands, we will have 5 log files numbered from zero to four"
say -v Samantha "That's right. In addition there will be one log file called all underscore commands dot log which is the concatenation of the individual command log files."
say -v Daniel "I like that"
sleep 2
say -v Karen "The generic-worker artifact has appeared, but is still uploading. Therefore the State is still running. When it has finished uploading, the state will change to completed"
sleep 2
say -v Samantha "While we wait for it to upload, we would like to say"
say -v Daniel "We hope you have enjoyed this tutorial, and found it informative"
say -v Samantha "We look forward to welcoming you at a future tutorial"
say -v "Pipe Organ" "Bye bye miss american pie"
say -v Karen "You guys rock"
sleep 5
say -v Karen "Looks like it has completed now - let's click on it to check it is available"
sleep 1
say -v "Pipe Organ" "how do you like them apples?"
