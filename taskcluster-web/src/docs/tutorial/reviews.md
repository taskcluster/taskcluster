---
title: Taskcluster Reviews
---

Taskcluster reviews aim to ensure that code we deploy is maintainable,
understandable, resilient and fast. We’ve developed a review process that
works really well for us. It is modeled on the general Mozilla review policy.
Each component, library or service has an owner who is responsible for the
overall design and implementation. Reviews are a collaborative conversation
which ensures that new code is good quality.

When a project starts, the engineers working on it figure out who the reviewer
for this project will be. It’s important that the component, library or
service owner be involved in figuring out the reviewer. This is to make sure
that there’s continuity in review. The first step of the review is to check if
the overall idea of the project is good. This might involve verifying that
assumptions are correct and collecting data to show a need.

Once the design work is mostly complete and some rough sketch of the code is
available, we will conduct something we call a “30% review”. This is to catch
problems with the architecture of the project and make sure that the final work
is done in a way that the reviewer finds acceptable. Every code path does not
need to be fully implemented, rather it’s an overall check that the project is
moving in the right direction. If there are design problems here, it's easier
to fix them than when the code is complete, which is the goal of this review.

After the code is completed, a more detailed review of function happens. The
goal of this review is to ensure that all of the code actually works as well as
following style and testing conventions. Unit tests are really useful here as
they help the reviewer verify functionality of code without having to trace
through it manually. Only after all review feedback has been address to the
satisfaction of the reviewer and author will we deploy the code.

Every member of the team writes code with their own style. The purpose of our
code reviews and style-checking tools is not to force a single style for
everything, rather to make sure that the style used is clear, concise and
readable.
