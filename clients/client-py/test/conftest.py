try:
    import secrets
except ImportError:
    secrets = {}
import random
import pytest


@pytest.fixture
def randbytes():
    """A function that will return the requested number of random bytes"""
    def randbytes(size):
        try:
            return random.randbytes(size)
        except AttributeError:
            # randbytes is only available on py36, so use secrets on older releases,
            # at the cost of wasting a lot of entropy
            return secrets.token_bytes(size)
    return randbytes
