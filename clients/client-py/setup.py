#!/usr/bin/env python

from setuptools import setup
from setuptools.command.test import test as TestCommand
import sys

VERSION = '88.0.3'

tests_require = [
    'pytest',
    'pytest-cov',
    'pytest-mock',
    'pytest-asyncio',
    'httmock',
    'mock',
    'setuptools-lint',
    'flake8',
    'psutil',
    'hypothesis',
    'tox',
    'coverage',
    'aiofiles',
    'httptest',
]

# requests has a policy of not breaking apis between major versions
# http://docs.python-requests.org/en/latest/community/release-process/
install_requires = [
    'requests>=2.4.3',
    'mohawk>=0.3.4',
    'python-dateutil>=2.8.2',
    'slugid>=2',
    'taskcluster-urls>=12.1.0',
    'aiohttp>=3.7.4',
    'async_timeout>=2.0.0',
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

if sys.version_info[0] == 3 and sys.version_info[:2] < (3, 9):
    raise Exception('This library does not support Python 3 versions below 3.9')

with open('README.md', encoding='utf8') as f:
    long_description = f.read()

if __name__ == '__main__':
    setup(
        name='taskcluster',
        version=VERSION,
        description='Python client for Taskcluster',
        long_description=long_description,
        long_description_content_type="text/markdown",
        author='Mozilla Taskcluster and Release Engineering',
        author_email='release+python@mozilla.com',
        url='https://github.com/taskcluster/taskcluster',
        packages=[
            "taskcluster",
            "taskcluster.aio",
            "taskcluster.generated",
            "taskcluster.generated.aio",
        ],
        install_requires=install_requires,
        test_suite="nose.collector",
        tests_require=tests_require,
        extras_require={
            'test': tests_require,
        },
        cmdclass={'test': Tox},
        zip_safe=False,
        classifiers=[
            'Programming Language :: Python :: 3.9',
            'Programming Language :: Python :: 3.10',
            'Programming Language :: Python :: 3.11',
            'Programming Language :: Python :: 3.12',
            'Programming Language :: Python :: 3.13',
        ],
    )
