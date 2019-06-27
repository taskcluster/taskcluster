resource "aws_iam_user" "service-user" {
  name = "${var.prefix}-${var.name}"
  path = "/taskcluster-service/"
}

resource "aws_iam_user_policy" "service-user" {
  name = "${aws_iam_user.service-user.name}-policy"
  user = "${aws_iam_user.service-user.name}"

  policy = "${var.policy}"
}
