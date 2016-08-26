#! /bin/bash -vex

## Get recent CA bundle for papertrail
sudo curl -o /etc/papertrail-bundle.pem https://papertrailapp.com/tools/papertrail-bundle.pem
md5=md5sum /etc/papertrail-bundle.pem | awk '{ print $1 }'
if [ $md5 != "c75ce425e553e416bde4e412439e3d09" ]; then
    echo "md5 for papertrail CA bundle does not match"
    exit -1
fi

# pip deps
sudo pip install python-statsd influxdb

# template source which must override system files.
template_source=$1

# docker_worker_source that needs to be untar'ed
docker_worker_source=$2

# install the system configuration
sudo tar xzf $template_source -C / --strip-components=1

# install the node app.
target=$HOME/docker_worker
mkdir -p $target
cd $target
tar xzf $docker_worker_source -C $target --strip-components=1
sudo chown -R $USER:$USER /home/ubuntu/docker_worker

retry_count=0
max_retries=5
until [ $retry_count -gt $max_retries ]; do
    npm install --production && break
    retry_count=$(($retry_count + 1))
    sleep 5
done

if [ $retry_count -ge $max_retries ]; then
    echo ""
    echo "Error installing docker-worker packages"
    exit -1
fi

npm rebuild
sudo npm install -g babel@4.7.16

# Initialize video and sound loopback modules
sudo modprobe v4l2loopback
sudo modprobe snd-aloop
# Create dependency file
sudo depmod



# Generate enough entropy to allow for gpg key generation
sudo rngd -r /dev/urandom

# Generate gpg key
cat >gen_key_conf <<EOF
  %echo Generating GPG signing key
  Key-Type: RSA
  Key-Length: 2048
  Name-Real: Docker-Worker
  Name-Email: taskcluster-accounts+gpgsigning@mozilla.com
  %commit
  %echo Done generating key
EOF

echo "Generating public signing key"
sudo gpg --batch --gen-key gen_key_conf
rm gen_key_conf

echo "Exporting public signing key"
sudo gpg -a --export-secret-keys > docker-worker-gpg-signing-key.key
sudo mv docker-worker-gpg-signing-key.key /etc

echo "Public signing key"
sudo gpg -a --export
