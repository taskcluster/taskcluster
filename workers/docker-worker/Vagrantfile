Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu-13.04-minimal"
  config.vm.box_url = "http://goo.gl/ceHWg"

  # We need to configure docker to expose port 4243
  config.vm.provision "shell", path: 'test/provision_vm.sh'

  config.vm.provision "docker", images: ["ubuntu"]
  
  # The host port seems to be the default for docker.. The guest is
  # random in the ephemeral range.
  config.vm.network :forwarded_port, guest: 4243, host: 60034
end
