
if ENV['AWS_ACCESS_KEY_ID'] == nil or ENV['AWS_SECRET_ACCESS_KEY'] == nil
  raise Vagrant::Errors::VagrantError.new,
        "This vagrantfile requires AWS credentials as environment variables!\n"
end

Vagrant.configure("2") do |config|
  config.vm.box = "taskcluster-dev-0.1.0"
  config.vm.box_url = "https://s3.amazonaws.com/task-cluster-dev/0.1.0/taskcluster_dev.box"
  config.vm.network :forwarded_port, host: 3000, guest: 3000
  config.vm.provision "shell", inline: <<-SCRIPT
sudo echo 'export AWS_ACCESS_KEY_ID="#{ENV['AWS_ACCESS_KEY_ID']}";' >> /etc/profile.d/aws.sh;
sudo echo 'export AWS_SECRET_ACCESS_KEY="#{ENV['AWS_SECRET_ACCESS_KEY']}";' >> /etc/profile.d/aws.sh;
sudo chmod a+x /etc/profile.d/aws.sh

# Create postgres role for queue
sudo -u postgres psql -c "CREATE ROLE queue LOGIN PASSWORD 'secret'";
sudo -u postgres psql -c "CREATE DATABASE queue_v1 OWNER queue";

# Setup postgres for access over localhost with md5
echo -ne "local all postgres peer\nlocal all all md5\n" | cat - /etc/postgresql/9.1/main/pg_hba.conf >> /tmp/pg_hba.conf;
mv /tmp/pg_hba.conf /etc/postgresql/9.1/main/pg_hba.conf;
sudo service postgresql restart;

# Dependencies that we are likely to change over time
sudo apt-get update;
sudo apt-get -y install screen vim;
sudo npm -g install nodemon;
SCRIPT
end
