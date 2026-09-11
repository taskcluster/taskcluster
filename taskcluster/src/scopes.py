def scope_text(scope):
    if isinstance(scope, str):
        return scope
    if isinstance(scope, dict):
        task_reference = scope.get("task-reference")
        if isinstance(task_reference, str):
            return task_reference
    return ""


def is_secret_scope(scope):
    return scope_text(scope).startswith("secrets:get:")
