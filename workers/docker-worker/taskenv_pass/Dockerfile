from ubuntu:13.10
maintainer James Lal <james@lightsofapollo.com>

# This docker file is a test image for the host to target.
# The general idea is we can interchange these hosts but we need
# At least one consistent one for testing the host itself.

# General setup stuff which is probably optional
run useradd -m tester
workdir /home/tester
env HOME /home/tester
env PATH /home/tester/bin:$PATH
run mkdir bin
add ./taskhost-who /home/tester/bin/taskhost-who
run chmod u+x bin/taskhost-who

