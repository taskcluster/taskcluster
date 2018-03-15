resource "aws_iam_user" "service-user" {
  name = "${var.name}"
  path = "/taskcluster-service/"
}

resource "aws_iam_access_key" "service-user" {
  user = "${aws_iam_user.service-user.name}"
}

resource "aws_iam_user_policy" "service-user" {
  user = "${aws_iam_user.service-user.name}-policy"
  user = "${aws_iam_user.service-user.name}"

  policy = "${var.policy}"
}
