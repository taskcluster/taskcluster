#!/usr/bin/env python3

import argparse
import glob
import jsone
import os
import shutil
import yaml

# todo: make things work no matter cwd and os

# secrets are interpolated by json-e into this goland template expression
# "{{ secret | b64enc }}"
# to make this work if a literal, quote it
# if a value being interpoloated by helm, leave it alone
def format_secrets(secrets):
    for key, value in secrets.items():
        if not value.startswith("."):
            secrets[key] = f'"{value}"'


# since non-secrets aren't interpolated into existing template expression
# need to turn them into that
def format_values(context):
    for key, value in context.items():
        if isinstance(value, str) and value.startswith("."):
            context[key] = "{{ " + value + " }}"


def render_rbac(project_name):
    context = {"project_name": project_name}
    for templatetype in ("role", "rolebinding", "serviceaccount"):
        template = yaml.load(
            open(f"templates/{templatetype}.yaml"), Loader=yaml.SafeLoader
        )
        write_file(template, context, templatetype)


def render_secrets(project_name, secrets):
    secrets['debug'] = '*'
    secrets['level'] = 'TRACE'
    format_secrets(secrets)
    context = {"project_name": project_name, "secrets": secrets}
    template = yaml.load(open("templates/secret.yaml"), Loader=yaml.SafeLoader)
    write_file(template, context, "secrets")


def render_deployment(project_name, secret_keys, deployment):
    context = {
        "project_name": project_name,
        "secret_keys": secret_keys,
        # below are default values
        "volume_mounts": [],
        "readiness_path": "/",
        "proc_name": False,
        "cpu": "50m",
        "memory": "100Mi",
        "replicas": "1",
        "background_job": False,
        "is_monoimage": True,
        # doing this ugly thing here because attempting to do it in jsone turned out even worse
        "checksum_calculation": "{{ " + f'include (print $.Template.BasePath "/{project_name}-secrets.yaml") . | sha256sum' + " }}"
    }
    context.update(deployment)
    format_values(context)
    template = yaml.load(open("templates/deployment.yaml"), Loader=yaml.SafeLoader)
    suffix = (
        f"deployment-{context['proc_name']}" if context["proc_name"] else "deployment"
    )
    write_file(template, context, suffix)
    template = yaml.load(open("templates/service.yaml"), Loader=yaml.SafeLoader)
    suffix = (
        f"service-{context['proc_name']}" if context["proc_name"] else "service"
    )
    write_file(template, context, suffix)


def render_cronjob(project_name, secret_keys, deployment):
    context = {
        "project_name": project_name,
        "secret_keys": secret_keys,
        # below are default values
        "volume_mounts": [],
        "is_monoimage": True,
    }
    context.update(deployment)
    format_values(context)
    template = yaml.load(open("templates/cronjob.yaml"), Loader=yaml.SafeLoader)
    suffix = f"cron-{context['job_name'].lower()}"
    write_file(template, context, suffix)


def render_ingress():
    shutil.copy("ingress/ingress.yaml", args.chartsdir)


def write_file(template, context, suffix):
    filepath = f"{args.chartsdir}/{context['project_name']}-{suffix}.yaml"
    try:
        f = open(filepath, "w+")
        f.write(yaml.dump(jsone.render(template, context), default_flow_style=False, width=float("inf")))
        f.close()
    except:
        print(f"failed to write {filepath}")


parser = argparse.ArgumentParser()
parser.add_argument("--service", help="Name of the service to render", default=None)
parser.add_argument(
    "--chartsdir", help="Directory to hold charts. Created if absent.", default="charts"
)
args = parser.parse_args()

try:
    os.mkdir(args.chartsdir)
except FileExistsError:
    pass

if args.service:
    service_declarations = [f"services/{args.service}.yaml"]
else:
    service_declarations = glob.glob("services/*yaml")

# in the future may support multiple styles of ingress
render_ingress()

for p in service_declarations:
    declaration = yaml.load(open(p), Loader=yaml.SafeLoader)
    project_name = declaration["project_name"]
    secret_keys = list(declaration["secrets"].keys())

    render_secrets(project_name, declaration["secrets"])
    render_rbac(project_name)
    for deployment in declaration.get("deployments", []):
        render_deployment(project_name, secret_keys, deployment)
    for cronjob in declaration.get("cronjobs", []):
        render_cronjob(project_name, secret_keys, cronjob)
