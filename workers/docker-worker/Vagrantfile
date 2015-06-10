Vagrant.configure("2") do |config|
  config.vm.box = "phusion/ubuntu-14.04-amd64"

  # We need to configure docker to expose port 60366
  config.vm.provision "shell", inline: <<-SCRIPT

  echo 'export TASKCLUSTER_CLIENT_ID="#{ENV['TASKCLUSTER_CLIENT_ID']}"' >> /home/vagrant/.bash_profile
  echo 'export TASKCLUSTER_ACCESS_TOKEN="#{ENV['TASKCLUSTER_ACCESS_TOKEN']}"' >> /home/vagrant/.bash_profile
  echo 'export PULSE_USERNAME="#{ENV['PULSE_USERNAME']}"' >> /home/vagrant/.bash_profile
  echo 'export PULSE_PASSWORD="#{ENV['PULSE_PASSWORD']}"' >> /home/vagrant/.bash_profile

SCRIPT

  config.vm.provision "shell", path: 'vagrant.sh'
  config.vm.provision "docker", images: [], version: "1.6.2"

end
