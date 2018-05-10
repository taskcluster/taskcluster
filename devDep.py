#!/usr/bin/env python
import setup
import pip

def x():
    print("No Pip Main found")
    exit(1)
pipMain = x

try:
    pipMain = pip.main
except:
    pass

try:
    pipMajor = int(pip.__version__.split('.')[0])
    if pipMajor >= 10:
        import pip._internal
        pipMain = pip._internal.main
except:
    pass

pipMain(['install', '--upgrade'] + setup.tests_require + setup.install_requires)
