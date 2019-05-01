# coding=utf-8
#####################################################
# THIS FILE IS AUTOMATICALLY GENERATED. DO NOT EDIT #
#####################################################
# noqa: E128,E201
from .client import BaseClient
from .client import createApiClient
from .client import config
from .client import createTemporaryCredentials
from .client import createSession
_defaultConfig = config


class GithubEvents(BaseClient):
    """
    The github service publishes a pulse
    message for supported github events, translating Github webhook
    events into pulse messages.

    This document describes the exchange offered by the taskcluster
    github service
    """

    classOptions = {
        "exchangePrefix": "exchange/taskcluster-github/v1/",
    }
    serviceName = 'github'
    apiVersion = 'v1'

    def pullRequest(self, *args, **kwargs):
        """
        GitHub Pull Request Event

        When a GitHub pull request event is posted it will be broadcast on this
        exchange with the designated `organization` and `repository`
        in the routing-key along with event specific metadata in the payload.

        This exchange takes the following keys:

         * routingKeyKind: Identifier for the routing-key kind. This is always `"primary"` for the formalized routing key. (required)

         * organization: The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped. (required)

         * repository: The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped. (required)

         * action: The GitHub `action` which triggered an event. See for possible values see the payload actions property. (required)
        """

        ref = {
            'exchange': 'pull-request',
            'name': 'pullRequest',
            'routingKey': [
                {
                    'constant': 'primary',
                    'multipleWords': False,
                    'name': 'routingKeyKind',
                },
                {
                    'multipleWords': False,
                    'name': 'organization',
                },
                {
                    'multipleWords': False,
                    'name': 'repository',
                },
                {
                    'multipleWords': False,
                    'name': 'action',
                },
            ],
        }
        return self._makeTopicExchange(ref, *args, **kwargs)

    def push(self, *args, **kwargs):
        """
        GitHub push Event

        When a GitHub push event is posted it will be broadcast on this
        exchange with the designated `organization` and `repository`
        in the routing-key along with event specific metadata in the payload.

        This exchange takes the following keys:

         * routingKeyKind: Identifier for the routing-key kind. This is always `"primary"` for the formalized routing key. (required)

         * organization: The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped. (required)

         * repository: The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped. (required)
        """

        ref = {
            'exchange': 'push',
            'name': 'push',
            'routingKey': [
                {
                    'constant': 'primary',
                    'multipleWords': False,
                    'name': 'routingKeyKind',
                },
                {
                    'multipleWords': False,
                    'name': 'organization',
                },
                {
                    'multipleWords': False,
                    'name': 'repository',
                },
            ],
        }
        return self._makeTopicExchange(ref, *args, **kwargs)

    def release(self, *args, **kwargs):
        """
        GitHub release Event

        When a GitHub release event is posted it will be broadcast on this
        exchange with the designated `organization` and `repository`
        in the routing-key along with event specific metadata in the payload.

        This exchange takes the following keys:

         * routingKeyKind: Identifier for the routing-key kind. This is always `"primary"` for the formalized routing key. (required)

         * organization: The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped. (required)

         * repository: The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped. (required)
        """

        ref = {
            'exchange': 'release',
            'name': 'release',
            'routingKey': [
                {
                    'constant': 'primary',
                    'multipleWords': False,
                    'name': 'routingKeyKind',
                },
                {
                    'multipleWords': False,
                    'name': 'organization',
                },
                {
                    'multipleWords': False,
                    'name': 'repository',
                },
            ],
        }
        return self._makeTopicExchange(ref, *args, **kwargs)

    def taskGroupCreationRequested(self, *args, **kwargs):
        """
        tc-gh requested the Queue service to create all the tasks in a group

        supposed to signal that taskCreate API has been called for every task in the task group
        for this particular repo and this particular organization
        currently used for creating initial status indicators in GitHub UI using Statuses API.
        This particular exchange can also be bound to RabbitMQ queues by custom routes - for that,
        Pass in the array of routes as a second argument to the publish method. Currently, we do
        use the statuses routes to bind the handler that creates the initial status.

        This exchange takes the following keys:

         * routingKeyKind: Identifier for the routing-key kind. This is always `"primary"` for the formalized routing key. (required)

         * organization: The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped. (required)

         * repository: The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped. (required)
        """

        ref = {
            'exchange': 'task-group-creation-requested',
            'name': 'taskGroupCreationRequested',
            'routingKey': [
                {
                    'constant': 'primary',
                    'multipleWords': False,
                    'name': 'routingKeyKind',
                },
                {
                    'multipleWords': False,
                    'name': 'organization',
                },
                {
                    'multipleWords': False,
                    'name': 'repository',
                },
            ],
        }
        return self._makeTopicExchange(ref, *args, **kwargs)

    funcinfo = {
    }


__all__ = ['createTemporaryCredentials', 'config', '_defaultConfig', 'createApiClient', 'createSession', 'GithubEvents']
