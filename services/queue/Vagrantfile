Vagrant.configure("2") do |config|
  config.vm.box = "taskcluster-dev-0.1.0"
  config.vm.box_url = "https://s3.amazonaws.com/task-cluster-dev/0.1.0/taskcluster_dev.box"
  config.vm.network :forwarded_port, host: 60001,   guest: 60001
  config.vm.network :forwarded_port, host: 5672,    guest: 5672
  config.vm.provision "shell", inline: <<-SCRIPT
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
SCRIPT
end
