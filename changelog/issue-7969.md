audience: users
level: patch
reference: issue 7969
---
D2G: fixes issue with loading the docker image artifact if the image already exists with a separate ID, causing the following output to be improperly parsed by D2G: `The image <imageName> already exists, renaming the old one with ID <sha> to empty string`.
