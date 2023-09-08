#/bin/bash

if [ ! -f docker-compose.yml ]; then
  echo "docker-compose.yml not found"
  exit 1
fi

# find all "taskcluster/" images that are currently used in docker-compose.yml
for line in $(grep "image:" docker-compose.yml | grep taskcluster |sort | uniq | sed -n "s/^.*image:\s*\(\S*\)/\1/p"); do
  IFS=":" read -r repo tag <<< "$line"
  echo "\nRemoving all $repo images except the used one: $tag "
  # display the list of images to be removed
  docker images --format '{{.Size}}\t{{.Repository}}:{{.Tag}}' | grep "$repo" | grep -v "$tag"
  # remove the images
  docker images --format '{{.Repository}}:{{.Tag}}' | grep "$repo" | grep -v "$tag" | xargs -I {} docker rmi {}
done
