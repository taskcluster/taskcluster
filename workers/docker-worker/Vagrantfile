Vagrant.configure("2") do |config|
  config.vm.box = "phusion/ubuntu-14.04-amd64"

  config.vm.synced_folder ENV['HOME'], ENV['HOME']

  # We need to configure docker to expose port 60366
  config.vm.provision "shell", inline: <<-SCRIPT

  # Setup Taskcluster and Pulse Credentials if available
  echo 'export TASKCLUSTER_CLIENT_ID="#{ENV['TASKCLUSTER_CLIENT_ID']}"' >> /home/vagrant/.bash_profile
  echo 'export TASKCLUSTER_ACCESS_TOKEN="#{ENV['TASKCLUSTER_ACCESS_TOKEN']}"' >> /home/vagrant/.bash_profile
  echo 'export TASKCLUSTER_ROOT_URL="#{ENV['TASKCLUSTER_ROOT_URL']}"' >> /home/vagrant/.bash_profile
  echo 'export PULSE_USERNAME="#{ENV['PULSE_USERNAME']}"' >> /home/vagrant/.bash_profile
  echo 'export PULSE_PASSWORD="#{ENV['PULSE_PASSWORD']}"' >> /home/vagrant/.bash_profile
  echo 'set -o vi' >> /home/vagrant/.bash_profile

SCRIPT

  config.vm.provision "shell" do |s|
    s.path = "deploy/packer/base/scripts/packages.sh"
    s.env = {VAGRANT_PROVISION: "1"}
  end

  config.vm.provision "shell", path: 'vagrant.sh'
  # Requires vagrant-reload plugin
  config.vm.provision :reload
end
