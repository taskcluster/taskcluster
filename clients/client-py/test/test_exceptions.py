import pickle

import pytest

from taskcluster.exceptions import (
    TaskclusterArtifactError,
    TaskclusterAuthFailure,
    TaskclusterConnectionError,
    TaskclusterRestFailure,
)


@pytest.mark.parametrize(
    "exc_class,kwargs",
    [
        (
            TaskclusterRestFailure,
            {
                "msg": "Test",
                "superExc": Exception("Test"),
                "status_code": 500,
                "body": {},
            },
        ),
        (TaskclusterConnectionError, {"msg": "Test", "superExc": Exception("Test")}),
        (
            TaskclusterAuthFailure,
            {"msg": "Test", "superExc": None, "status_code": 401, "body": {}},
        ),
        (TaskclusterArtifactError, {"message": "Test", "reason": "Test"}),
    ],
)
def test_exception_pickle(exc_class, kwargs):
    """Test that taskcluster exceptions can be pickled."""
    exc = exc_class(**kwargs)
    unpickled = pickle.loads(pickle.dumps(exc))
    assert isinstance(unpickled, exc_class)
