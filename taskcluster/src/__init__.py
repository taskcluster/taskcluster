from importlib import import_module


def register(graph_config):
    import_module('.job', package=__name__)
