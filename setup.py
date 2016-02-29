#!/usr/bin/env python

from setuptools import setup
from setuptools.command.test import test as TestCommand
import sys

# The VERSION variable is automagically changed
# by release.sh.  Make sure you understand how
# that script works if you want to change this
VERSION = '0.2.0'


tests_require = [
    'nose==1.3.4',
    'httmock==1.2.2',
    'rednose==0.4.1',
    'mock==1.0.1',
    'setuptools-lint==0.3',
    'flake8==2.2.5',
    'psutil==2.1.3',
    'hypothesis',
    'pgpy',
    'tox==2.3.1',
    'coverage==4.0.3',
]

# requests has a policy of not breaking apis between major versions
# http://docs.python-requests.org/en/latest/community/release-process/
install_requires = [
    'requests>=2.4.3,<3',
    'mohawk>=0.3.1',
    'slugid',
    'six',
]

# from http://testrun.org/tox/latest/example/basic.html
class Tox(TestCommand):
    user_options = [('tox-args=', 'a', "Arguments to pass to tox")]

    def initialize_options(self):
        TestCommand.initialize_options(self)
        self.tox_args = None

    def finalize_options(self):
        TestCommand.finalize_options(self)
        self.test_args = []
        self.test_suite = True

    def run_tests(self):
        # import here, cause outside the eggs aren't loaded
        import tox
        import shlex
        args = self.tox_args
        if args:
            args = shlex.split(self.tox_args)
        errno = tox.cmdline(args=args)
        sys.exit(errno)

if sys.version_info[:2] == (2, 7):
    tests_require.extend([
        'subprocess32==3.2.6',
    ])

if __name__ == '__main__':
    setup(
        name='taskcluster',
        version=VERSION,
        description='Python client for Taskcluster',
        author='John Ford',
        author_email='jhford@mozilla.com',
        url='https://github.com/taskcluster/taskcluster-client.py',
        packages=['taskcluster'],
        package_data={
            'taskcluster': ['**.json']
        },
        install_requires=install_requires,
        test_suite="nose.collector",
        tests_require=tests_require,
        cmdclass={'test': Tox},
        zip_safe=False,
    )
