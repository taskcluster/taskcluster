# Team Expectations

The following are a set of general expectations for the Taskcluster team. While some of the management-related expectations will not apply directly to community contributors, they still provide good guidance as to behavioral norms and accepted practice.

Table of Contents
=================

   * [Team Expectations](#team-expectations)
      * [Accountability](#accountability)
      * [Communications](#communications)
      * [Planning and The Design Process: RFCs](#planning-and-the-design-process-rfcs)
      * [Implementation and Review](#implementation-and-review)
      * [Triage](#triage)
      * [Dealing with outages](#dealing-with-outages)
      * [See also](#see-also)

## Accountability

1.  Team members should do their utmost to adhere to expectations laid out in this document. While these are guidelines, not hard-and-fast rules, breaking them should always be accompanied by a solid rationale, communicated to those affected or the team at large.
2.  Team members should hold others accountable and indicate to them when they feel they are not meeting expectations. Persistent problems should be raised to management. Without collective accountability, these expectations will be ineffective.

## Communications

1.  The Taskcluster team operates in multiple timezones on 3 different continents. Finding meeting times that work for everyone is challenging. We try to keep whole-group meetings to a minimum, but smaller meetings for subsets of interested people are encouraged. Information that comes out of smaller meetings should be shared with the group via email, bug comment, or documentation update. Decisions that come out of meetings still need to weather the RFC process (see below).
2.  The team commits to following relevant channels to stay informed. This includes bugmail and github notifications for important repositories like RFCs, minimum:
    * bugzilla NIs
    * github PRs
    * Slack notifications
    * Element pings
    * calendar invites
    * direct email
3.  When someone asks a question, give them the benefit of the doubt with the assumption that they’ve made an effort to figure it out. With that assumption, helpfully answer their question, rather than just directing them to the manual. “Being charitable” could describe this. This can be particularly challenging for community contributors, but the same logic applies.
4.  Similarly, when you need help, do at least some upfront research, and try to keep questions specific. Explaining the context of your problem is extremely helpful.
5.  We should switch to synchronous communication (zoom or other video chat) when asynchronous communication (email, bug comments) are artificially lengthening cycle times.
6.  Team members who do not work in Mozilla Standard Time (US Pacific Time) should be explicit about when they are available for meetings. They are not expected to be available in their evenings unless they choose to make themselves available.
7.  Interpersonal issues should be brought to management ASAP.
8.  Don’t suggest you will simply re-implement something as a way of shutting down discussion about a particular issue.

## Planning and The Design Process: RFCs

1.  Taskcluster manages major changes to the platform through "requests for comment", known as RFCs. These provide an open, transparent decision-making process and a way to track ideas from initial proposal through decision and implementation.
2.  Taskcluster's RFCs are stored in the [taskcluster-rfcs repository](https://github.com/taskcluster/taskcluster-rfcs). The RFC process is documented in the [mechanics doc](https://github.com/taskcluster/taskcluster-rfcs/blob/master/mechanics.md).
3.  RFCs should be written *after* establishing general agreement among the involved people about the issue and the direction to take.
4.  Design decisions can be revisited for security reasons or if there are significant concerns.
5.  Quick experiments can and should still happen in this model, but don't get too attached to them unless you are using them to strengthen a new or existing RFC. 30% reviews are a good way to gauge the appropriateness of a given experiment.
6.  Security concerns are an important part of the RFC process, i.e. security cannot be left to the implementation and review phase.

## Implementation and Review

1.  New code should conform to the established [Taskcluster best practices](https://github.com/taskcluster/taskcluster/tree/main/dev-docs/best-practices). Best efforts should be made to bring existing code up to those standards when changes are made. If best practices don't exist for a given area or language, the author should establish some with reference to other similar Taskcluster sources or industry best practices.
2.  For larger coding tasks, the author should seriously consider splitting it up and figuring out what can be committed from what has already been completed.
3.  Github Pull Requests should be assigned to two alternative reviewers, of which only one is required to perform the review, unless either the author or the reviewer explicitly request additional review from another party in the PR conversation.
4.  For PRs where the author does not have permission to merge the PR, the last reviewer to accept the changes should merge the PR on approval of the changes.
5.  For PRs where the author does have permission to merge the PR, the reviewer should NOT merge the PR, unless explicitly requested by the author in the PR conversation.  This allows the PR author to be responsible for handling any issues resulting from the landing.
6.  Any changes landed to the main branch of the mozilla/community-tc-config github repo should be applied to the community-tc taskcluster deployment as soon as they land, by whoever landed the changes (until such time that this happens in automation).
7.  During code review, the author should, upon receiving feedback, assume that the reviewer had the best intentions during the review. At the same time, the reviewer should not give feedback in a negative way that could be taken personally. (See the article [How to Do Code Reviews Like a Human (Part One)](https://mtlynch.io/human-code-reviews-1/) for more on this.)
8.  It is completely acceptable for the author to push back and discuss comments given during code review. The reviewer is not a gatekeeper to the “holy main branch”; we are a team working to build software. While we acknowledge that some services or areas of code have de facto owners, if there is disagreement about strategy or implementation, the larger group should be involved to decide on the best course or action. Where possible, these decisions should be reflected back into the best practices documentation.
9.  If there is a large or persistent disconnect between author and reviewer, setup a synchronous meeting to work through it. Management can facilitate as required.
10.  The author should have run the code, thoroughly tested their changes, and executed the test suite *before* posting their changes for review. Note: automated CI testing like travis is acceptable, even preferable, provided it exists for the repo in question *AND* is also augmented for your changes as required.
11.  The author should have reviewed their own changes critically, in the mindset of a reviewer, before formally requesting review. It is not acceptable to submit code for review immediately after the author has confirmed its functionality, as that is only part of writing good software.
12.  If an author needs additional help in testing, they should explicitly request it and give a reason as to why further manual testing is required. Otherwise there is no assumption that the fix/change will be tested by the reviewer. The reviewer is of course free to do so if they feel this will help the review.
13.  For reviewers, read the code before you review, i.e. don’t offer off-the-cuff responses based on what you *assume* is in the patch.
14.  When a reviewer approves a patch, they should be confident that they fully understand every change made. They should have carefully looked through test and doc changes. They should have looked for ways to break the code, due to bad networks, system failures, malicious users, attackers, etc. If the reviewer didn’t do a thorough review, e.g. the reviewer is requesting architectural changes, then the reviewer should note this.
15.  Reviewers should not demand scope creep/bloat when reviewing. File follow-up bugs for related improvements.
16.  It is OK to decline a review request, or bring in an alternate reviewer.
17.  Individual team members should set their own expectations for review turnaround, but should generally adhere to the Mozilla standard of 1 business day.
18.  Everyone involved in reviews should watch for potential security issues. Security-sensitive changes should involve multiple reviewers.

## Triage

1.  Service requests should be handled same-day. Make sure the correct team is acting on the service request, e.g. releng should handle scope changes for Firefox CI.
2.  The QA contact is responsible for regular triage of their component(s). The weekly group triage meeting can be used to discuss “tricky” bugs.
3.  Open github issues will be reviewed weekly to ensure nothing is falling through the cracks.
4.  For bugs that won’t be tackled immediately (lack of resources, design decisions, etc), the last comment in the bug from the TC team should explain the rationale behind that decision. This applies whether the bug is to be resolved or not.
5.  Bugs marked as P5 are valid issues with no plans to fix. This is done to exclude these bugs from regular triage.
6.  Bugs marked as “blocker” are keeping the trees closed and require immediate action.

## Dealing with outages

1.  One person should coordinate each outage using the #taskcluster Element channel. This coordinator is responsible for communicating outage status to interested parties (sheriffs, bugzilla updates, etc). The coordinator doesn’t necessarily need to come from the Taskcluster team.
2.  During an outage, the coordinator can call on whatever resources they need to unblock the issue.
3.  If an outage extends beyond the end of a coordinator’s working day, coordination should be explicitly handed off to someone else
4.  We will hold blameless post-mortems for all outages.
5. Retrospective documentation for all outages should be documented in the [retrospectives repository](https://github.com/taskcluster/taskcluster-retrospectives).

## See also
* [How to contribute to Taskcluster](./CONTRIBUTING.md)
* [Taskcluster Code of Conduct](./CODE_OF_CONDUCT.md)
