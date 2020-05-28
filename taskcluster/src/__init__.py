from importlib import import_module


def register(graph_config):
    import_module('.job', package=__name__)
    import_module('.transforms', package=__name__)
    import_module('.loader', package=__name__)
    import_module('.target_tasks', package=__name__)
