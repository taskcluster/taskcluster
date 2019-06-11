output "azure_account" {
  value = "${azurerm_storage_account.base.name}"
}

output "private_artifact_bucket" {
  value = "${aws_s3_bucket.iprivate_artifacts}"
}

output "private_blob_artifact_bucket" {
  value = "${aws_s3_bucket.private_blobs}"
}

output "public_artifact_bucket" {
  value = "${aws_s3_bucket.public_artifacts}"
}

output "public_blob_artifact_bucket" {
  value = "${aws_s3_bucket.public_blobs}"
}
