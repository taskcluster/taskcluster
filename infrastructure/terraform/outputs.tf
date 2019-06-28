output "azure_account" {
  value = "${azurerm_storage_account.base.name}"
}

output "private_artifact_bucket" {
  value = "${aws_s3_bucket.private_artifacts.id}"
}

output "private_blob_artifact_bucket" {
  value = "${aws_s3_bucket.private_blobs.id}"
}

output "public_artifact_bucket" {
  value = "${aws_s3_bucket.public_artifacts.id}"
}

output "public_blob_artifact_bucket" {
  value = "${aws_s3_bucket.public_blobs.id}"
}
