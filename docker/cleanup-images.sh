#/bin/bash

if [ ! -f .env ]; then
  echo ".env not found"
  exit 1
fi

# find all "taskcluster/" images that are currently used in docker-compose.yml
for line in $(grep "IMAGE" .env | grep taskcluster |sort | uniq | sed -n "s/^IMAGE.*=\s*\(\S*\)/\1/p"); do
  IFS=":" read -r repo tag <<< "$line"
  echo "\nRemoving all $repo images except the used one: $tag "
  # display the list of images to be removed
  docker images --format '{{.Size}}\t{{.Repository}}:{{.Tag}}' | grep "$repo" | grep -v "$tag"
  # remove the images
  docker images --format '{{.Repository}}:{{.Tag}}' | grep "$repo" | grep -v "$tag" | xargs -I {} docker rmi {}
done
