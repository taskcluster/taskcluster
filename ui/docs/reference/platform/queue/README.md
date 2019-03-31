# Queue Service

This is the central queue coordinating execution of tasks in the Taskcluster setup.

## Usage

See the manual chapter, and the other documents in this section, for more information on interacting with the queue.

## Deployment

### AWS Access Policies Required

The taskcluster queue uses an S3 bucket for storing artifacts.
In order to operate on these resources the following access policy is needed:

```js
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::<public-artifact-bucket>/*"
        "arn:aws:s3:::<private-artifact-bucket>/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket",
        "s3:PutBucketCORS"
      ],
      "Resource": [
        "arn:aws:s3:::<public-artifact-bucket>"
        "arn:aws:s3:::<private-artifact-bucket>"
      ]
    }
  ]
}
```

Furthermore, you'll need to set the following _bucket policy_ on your public
artifact bucket:
```js
{
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": {
        "AWS": "*"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<public-artifact-bucket>/*"
    }
  ]
}
```
