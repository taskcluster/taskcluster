import os
import re

import yaml

import taskcluster_urls as tcurls


SPEC_FILE = os.path.join(os.path.dirname(__file__), '..', 'tests.yml')


def pytest_generate_tests(metafunc):
    with open(SPEC_FILE) as testsFile:
        spec = yaml.load(testsFile)
        metafunc.parametrize(
            ['function', 'args', 'expected_url', 'root_url'],
            [
                (
                    getattr(
                        tcurls,
                        # this regex transforms function names found in
                        # tests.yml into the python function name, e.g.
                        # 'expectedUrl' -> 'expected_url'
                        re.sub(
                            '([A-Z]+)', r'_\1',
                            test['function']
                        ).lower()
                    ),
                    argSet,
                    test['expected'][cluster],
                    rootURL
                )
                for test in spec['tests']
                for argSet in test['argSets']
                for (cluster, rootURLs) in spec['rootURLs'].items()
                for rootURL in rootURLs
            ]
        )


def test_basic(function, args, expected_url, root_url):
    assert function(root_url, *args) == expected_url
