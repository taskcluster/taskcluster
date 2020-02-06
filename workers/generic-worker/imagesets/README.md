### Building an image set

To build an image set:

  * AWS only: Sign in with 2FA and export env vars `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
  * GCP only: `export GCP_PROJECT=<your google cloud project of choice to deploy image into>`
  * Run `./imageset.sh (aws|gcp) (delete|update) IMAGE_SET`

This will update/delete the image set `IMAGE_SET` whose definition is in the
subdirectory `<IMAGE_SET>`.
