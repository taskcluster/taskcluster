#!/usr/bin/env python

######################################################################
# Loggly Syslog configuration script.
#
# This script automatically configures a syslog-ng or rsyslog
# setup such that it sends all logs from this system to Loggly.
#
# For this to work you must have an account on the Loggly system. Sign
# up for one at http://www.loggly.com.
#
# For best results the script should be run with superuser privileges.
#
# (c) Copyright Loggly 2013.
######################################################################

from __future__ import with_statement

import os, os.path
import platform
import re
import sys
import getpass
from distutils.version import StrictVersion
import time
from datetime import datetime
import tempfile
try:
    import urllib.request as urllib_request
except ImportError:
    import urllib2 as urllib_request
try:
    import json
except ImportError:
    json = None
import uuid
import base64
import socket
import subprocess
from optparse import OptionParser, SUPPRESS_HELP
import traceback

#Constants
TEMP_PREFIX = 'temp'
ROOT_USER = 1
NON_ROOT_USER = 2

MINIMUM_SUPPORTED_PYTHON_VERSION = '2.6'
VERIFICATION_SLEEP_INTERVAL = 240
VERIFICATION_SLEEP_INTERVAL_PER_ITERATION = 5

OS_UBUNTU = 1
OS_FEDORA = 2
OS_RHEL = 3
OS_CENTOS = 4
OS_UNSUPPORTED = -1

PROD_SYSLOG_NG = 1
PROD_RSYSLOG = 2
PROD_UNSUPPORTED = -1

LOGGLY_DOMAIN = "gen2.loggly.com"
LOGGLY_SYSLOG_SERVER = "logs-01.loggly.com"

LOGGLY_SYSLOG_PORT = 514
DISTRIBUTION_ID = "41058"
LOGGLY_CONFIG_FILE = "22-loggly.conf"
LOGGLY_ENV_DETAILS_FILE = "env_details.txt"
LOGGLY_BASH_SCRIPT = 'configure-syslog.%s.sh' % os.getpid()
PROCESS_ID = -1

STR_PYTHON_FAIL_MESSAGE = '''
Python version check fails: Installed version is "%s. \
Minimum required version is %s.
'''.strip()

STR_MULTIPLE_SYSLOG_MESSAGE = "Multiple syslogd are running."
STR_AUTHTOKEN_NOTFOUND_MESSAGE = "No Customer Tokens were found."
STR_AUTHENTICATION_FAIL_MESSAGE = "Authentication fail for user %s"

VERIFICATION_FAIL_MESSAGE = '''
Loggly verification failed. Please visit \
http://loggly.com/docs/sending-logs-unixlinux-system-setup/ for more information.
'''.strip()

STR_EXIT_MESSAGE = '''
This environment (OS : %s) is not supported by the Loggly Syslog \
Configuration Script. Please visit \
http://loggly.com/docs/sending-logs-unixlinux-system-setup/ \
for more information.
'''

STR_NO_SYSLOG_MESSAGE = "\nSupported syslog type/version not found."

STR_ERROR_MESSAGE = '''
Can not automatically re-configure syslog for this Linux distribution.
Use the help option for instructions to manually re-configure syslog for Loggly.
'''.strip()

STR_SYSLOG_DAEMON_MESSAGE = '''
Syslog daemon (%s) is not running. Please start %s daemon and try again.
'''

REST_URL_GET_AUTH_TOKEN = "http://%s.%s/apiv2/customer"
REST_URL_GET_SEARCH_ID = "http://%s.%s/apiv2/search?q=%s&from=-2h&until=now&size=10"
REST_URL_GET_SEARCH_RESULT = "http://%s.%s/apiv2/events?rsid=%s"

USER_NAME_TEXT = "Enter the username that you use to log into your loggly account."

ACCOUNT_NAME_TEXT = '''
Enter your Loggly account name. This is your subdomain. For example if \
you login at mycompany.loggly.com,
your account name is mycompany.
'''.lstrip()

INSTALLATION_COMPLETED_TEXT = "Configuration script completed."

_LOG_SOCKET = None
OUR_PROGNAME      = "configure-syslog"
OUR_VERSION       = 1
LOGGLY_AUTH_TOKEN = "1ec4e8e1-fbb2-47e7-929b-75a1bff5ffe0"

RSYSLOG_PROCESS = "rsyslogd"
SYSLOG_NG_PROCESS = "syslog-ng"

min_supported_syslog_versions = {
    PROD_SYSLOG_NG: "1.6",
    PROD_RSYSLOG: "1.19",
}

default_config_file_name = {
                            PROD_SYSLOG_NG: "/etc/syslog-ng/syslog-ng.conf",
                            PROD_RSYSLOG: "/etc/rsyslog.conf",
                            }

configuration_text = {

                                PROD_SYSLOG_NG:
'''
#          -------------------------------------------------------
#          Syslog Logging Directives for Loggly (%s.loggly.com)
#          -------------------------------------------------------

%s
template LogglyFormat { template("<${PRI}>1 ${ISODATE} ${HOST} ${PROGRAM} \
${PID} ${MSGID} [%s@%s] $MSG\\n");};
destination d_loggly { tcp("%s" port(%s) template(LogglyFormat) flush_timeout(1000) frac_digits(3)); };
log { source(%s); destination(d_loggly); };

#          -------------------------------------------------------
#          End of Syslog Logging Directives for Loggly
#          -------------------------------------------------------
''',

                                PROD_RSYSLOG:
'''
#          -------------------------------------------------------
#          Syslog Logging Directives for Loggly (%s.loggly.com)
#          -------------------------------------------------------

# Define the template used for sending logs to Loggly. Do not change this format.
$template LogglyFormat,"<%%pri%%>%%protocol-version%% %%timestamp:::date-rfc3339%% \
%%HOSTNAME%% %%app-name%% %%procid%% %%msgid%% [%s@%s] %%msg%%"

# Send messages to Loggly over TCP using the template.
*.*             @@%s:%s;LogglyFormat

#          -------------------------------------------------------
#          End of Syslog Logging Directives for Loggly
#          -------------------------------------------------------
'''
                            }
USER = None
SUBDOMAIN = None
SYSLOG_NG_SOURCE = 's_loggly'

SYSLOG_NG_SOURCE_TEXT_3_2 = '''
source %s {
\tunix-stream("/dev/log");
\tinternal();
\tfile("/proc/kmsg" program_override("kernel: "));
};
'''.strip()

SYSLOG_NG_SOURCE_TEXT_ABOVE_3_2 = '''
source %s {
\tsystem();
\tinternal();
};
'''.strip()

LOGGLY_HELP = '''
Instructions to manually re-configure syslog for Loggly
=======================================================

1. Configure the version of syslog you're running.  More details are available http://www.loggly.com/docs/sending-logs-unixlinux-system-setup/
 rsyslog
 -------

 -Edit your rsyslog.conf file, usually found in /etc/rsyslog.conf, \
and add following lines at bottom of the configuration file:

 ### Syslog Logging Directives for Loggly (%(subdomain)s.loggly.com) ###
  $template LogglyFormat,"<%%pri%%>%%protocol-version%% \
%%timestamp:::date-rfc3339%% %%HOSTNAME%% %%app-name%% %%procid%% %%msgid%% \
[%(token)s@%(dist_id)s] %%msg%%"
 *.*             @@%(syslog_server)s:%(syslog_port)s;LogglyFormat
 ### END Syslog Logging Directives for Loggly (%(subdomain)s.loggly.com) ###

 syslog-ng
 ---------

 -Edit your syslog-ng.conf file, usually found in /etc/syslog-ng/syslog-ng.conf:

 - Instructions for syslog-ng version above 3.2
 -- Look for source with internal() directive. If no source found with \
internal() directive then add following lines at bottom of the file:
 ### Syslog Logging Directives for Loggly (%(subdomain)s.loggly.com) ###
\tsource %(syslog_source)s {
\t\tsystem();
\t\tinternal();
\t\tfile("/path/to/your/file" follow_freq(1) flags(no-parse));
\t};

 -If version of syslog-ng is 3.2 or below and source with internal() is not \
present then add the following lines at the bottom of the file
 ### Syslog Logging Directives for Loggly (%(subdomain)s.loggly.com) ###
\tsource %(syslog_source)s {
\t\tinternal();
\t\tunix-stream("/dev/log");
\t\tfile("/path/to/your/file" follow_freq(1) flags(no-parse));
\t};

 -All versions: Append the following lines at the end of configuration file. The \
source_name must match the name of the source with internal() e.g.  %(syslog_source)s.

 template LogglyFormat { template("<${PRI}>1 ${ISODATE} ${HOST} ${PROGRAM} \
${PID} ${MSGID} [%(token)s@%(dist_id)s] $MSG\\n");};
 destination d_loggly { tcp("%(syslog_server)s" port(%(syslog_port)s) template(LogglyFormat) flush_timeout(1000) frac_digits(3)); };
 log { source(%(syslog_source)s); destination(d_loggly); };
 ### END Syslog Logging Directives for Loggly (%(subdomain)s.loggly.com) ###

 -WARNING: if a source with internal() is already present then do not add the new \
source. The new source will break configurations.

2. Once you are done configuring syslog-ng or rsyslog, restart it
   Example:  /etc/init.d/syslog-ng restart

3. Send some data through syslog-ng or rsyslog to have it forwarded to your Loggly account
   logger "loggly is better than a bee in your aunt\'s bonnet"
'''.strip()

# log priorities...
LOG_PRIORITIES = {
    "emerg":   0,  "alert":  1,  "crit": 2,   "error": 3,
    "warning": 4,  "notice": 5,  "info": 6,   "debug": 7
    }

# log facilities...
# (avoiding a dict comprehension for Python 2.6 compat)
LOG_FACILITIES = dict([(k, v << 3) for k, v in {
    "kern": 0, "user": 1, "mail": 2, "daemon": 3,
    "auth": 4, "syslog": 5, "lpr": 6, "news": 7,
    "uucp": 8, "cron": 9, "security": 10, "ftp": 11,
    "ntp": 12, "logaudit": 13, "logalert": 14, "clock": 15,
    "local0": 16, "local1": 17, "local2": 18, "local3": 19,
    "local4": 20, "local5": 21, "local6": 22, "local7": 23
}.items()])

PYTHON_FAIL = "pythonfail"
PS_FAIL = "psfail"
OS_FAIL = "osfail"
SYSLOG_FAIL = "syslogfail"
MULTPLE_SYSLOG_RUNNING = "multiple_syslog_running"
AUTH_TOKEN_FAIL = "authtoken_fail"
VERIFICATION_FAIL = "verification_fail"
AUTHENTICATION_FAIL = "authentication_fail"
LOGGLY_QA = []

#   Available options for LOGGLY_QA are...
#   "pythonfail"                --> Python version check fail
#   "psfail"                    --> Syslog daemon is not running
#   "osfail"                    --> Unsupported os
#   "syslogfail"                --> Supported_syslog_versions not found
#   "multiple_syslog_running"   --> Multiple Syslog Running
#   "authtoken_fail"            --> Authtoken not found
#   "verification_fail"         --> Syslog configuration fail
#   "authentication_fail"       --> Invalid username or password

def printLog(message):
    print(message)

def printMessage(message):
    printLog("\n****************************"
                     "*********************************")
    printLog("****** %s "
                     "Loggly Syslog Configuration Script ******" % message)
    printLog("**********************************"
                     "***************************\n")

def printEnvironment(current_environment):
    """
    Print environment details on console
    """
    printLog("Operating System: %s-%s(%s)" %
                    (current_environment['distro_name'],
                     current_environment['version'],
                     current_environment['id']))

    printLog("Syslog versions:")
    if current_environment['syslog_versions']:
        for i, version in enumerate(current_environment['syslog_versions'], 1):
            line = "\t%d.   %s(%s)" % (i, version[0], version[1])
            printLog(line)
    else:
        printLog("\tNo Syslog Version Found......")

def sendEnvironment(data):
    printLog("Sending environment details to Loggly Server.")
    log(data)

def get_python_version_string():
    return ".".join(map(str, sys.version_info))

def sys_exit(reason = None):
    """
    If script fails, send environment details with reason for failure to loggly
    """
    current_environment = get_environment_details()
    data = {
        "operating_system": current_environment['operating_system'],
        "syslog_versions": current_environment['syslog_versions'],
        "python_version": get_python_version_string(),
        "reason":reason,
        "username":USER,
        "subdomain": SUBDOMAIN
        }
    sendEnvironment(data)
    printMessage("Aborting")
    sys.exit(-1)

def usr_input(st):
    """
    Take user input
    """
    sys.stdin = open("/dev/tty")
    get_input = ''
    try:
        get_input = raw_input
    except NameError:
        get_input = input

    st = get_input(st)
    return st

def version_compare(version1, version2):
    """
    Function will return following values.
    -1 : version1 is less than version2
    0 : version1 equals to version2
    1 : version1 is greater than version2
    """
    cmp_ex = lambda x, y: StrictVersion(x).__cmp__(y)
    return cmp_ex(version1, version2)

def get_os_id(os_name):
    """
    Get OS ID for corresponding OS present on machine
    """
    return {
        'ubuntu': OS_UBUNTU,
        'fedora': OS_FEDORA,
        'red hat enterprise linux server': OS_RHEL,
        'centos': OS_CENTOS,
        'debian': OS_UBUNTU,
        }.get(os_name.lower(), OS_UNSUPPORTED)

def get_syslog_id(product_name):
    """
    Get syslog id from installed syslog product
    """
    return {
        'syslog-ng': PROD_SYSLOG_NG,
        'rsyslog': PROD_RSYSLOG,
        }.get(product_name.lower(), PROD_UNSUPPORTED)

def get_syslog_process_name(product_name):
    """
    Get syslog process name
    """
    return {
        'syslog-ng': SYSLOG_NG_PROCESS,
        'rsyslog': RSYSLOG_PROCESS,
        }.get(product_name.lower(), PROD_UNSUPPORTED)

def get_syslog_version(verify_config_paths=False):
    """
    Guess the syslog daemon and version number,
    returns a singleton list containing a tuple: [(daemon, version_string)]

    if verify_config_paths is set, this will also verify the configuration file
    and/or paths are present on this system
    """

    SYSLOG_PATHS = [
        # (syslog type, command, conf path, conf.d path)
        ("rsyslog", "rsyslogd", "-v", "/etc/rsyslog.conf", "/etc/rsyslog.d/"),
        ("syslog-ng", "syslog-ng", "--version", "/etc/syslog-ng/syslog-ng.conf", "/etc/syslog-ng/")
    ]

    for s in SYSLOG_PATHS:

        p = subprocess.Popen(s[1] + ' ' + s[2], shell=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
        p.wait()
        if p.returncode != 0:
            continue

        version_line = p.stdout.readlines()[0]

        if verify_config_paths:
            if not os.path.isfile(s[3]) or not os.path.isdir(s[4]):
                continue

        # extract the version number from the daemon's version report,
        # only cares about the major and minor version numbers and ignores
        # the point number.
        version_pattern = r'%s (\d+\.+\d)' % s[1]
        version_string = re.search(version_pattern,
                                   version_line.decode('utf-8')).group(1)

        return [(s[0], version_string)]

    return []

def get_user_type():
    """
    Return user type
    """
    if os.getuid() == 0:
        return ROOT_USER
    else:
        printLog("Script not started as root")
        return NON_ROOT_USER

def try_int(x):
    try:
        return int(x)
    except ValueError:
        return x

def version_tuple(v):
    return list(map(try_int, v.split('.')))

def greater_version(minimum, version):
    return version_tuple(version) >= version_tuple(minimum)

def get_environment_details():
    """
    Get Distro Name, Distro ID, Version and ID.
    """
    printLog("Reading environment details....")
    distribution = platform.linux_distribution()
    distro_name, version, version_id = distribution
    distro_id = get_os_id(distro_name)
    return {
        'distro_name': distro_name,
        'distro_id': distro_id,
        'version': version,
        'id': version_id,
        'syslog_versions': get_syslog_version(),
        'supported_syslog_versions': {},
        'operating_system': "%s-%s(%s)" % distribution
    }

def perform_sanity_check(current_environment):
    """
    Performing quick check of OS and Syslog
    """
    printLog("Performing sanity check....")

    syslog_versions = {}
    for (syslog_type, syslog_version)\
        in current_environment['syslog_versions']:
        syslog_id = get_syslog_id(syslog_type)
        if greater_version(min_supported_syslog_versions.get(syslog_id),
                syslog_version):
            syslog_versions[syslog_type] = syslog_version

    if SYSLOG_FAIL in LOGGLY_QA or not syslog_versions:
        printLog(STR_NO_SYSLOG_MESSAGE)
        printLog(STR_ERROR_MESSAGE)
        sys_exit(reason = STR_NO_SYSLOG_MESSAGE)

    #Check whether multiple syslogd running or not
    if len(syslog_versions) > 1 or MULTPLE_SYSLOG_RUNNING in LOGGLY_QA:
        index = 0
        running_syslog_count = 0
        for (syslog_name, syslog_version) in syslog_versions.items():
            if check_syslog_service_status(syslog_name):
                running_syslog_count += 1
            index += 1
            printLog("\t%d. %s(%s)" %
                            (index, syslog_name, syslog_version))
        if running_syslog_count > 1 or MULTPLE_SYSLOG_RUNNING in LOGGLY_QA:
            printLog(STR_MULTIPLE_SYSLOG_MESSAGE)
            printLog(STR_ERROR_MESSAGE)
            sys_exit(reason = STR_MULTIPLE_SYSLOG_MESSAGE)

    current_environment['supported_syslog_versions'] = syslog_versions
    printLog("Sanity Check Passed. Your environment is supported.")

def find_syslog_process():
    """
    Returns the running syslog type (syslog-ng, rsyslog)
    and the PID of the running process.
    """

    syslog_ps_commands = [
        ("ps -fU syslog | grep syslog | grep -v grep"),
        ("ps -ef | grep -e syslog-ng -e rsyslog -e syslogd "
         "| grep -v grep | grep -v supervising")
        ]

    for ps_command in syslog_ps_commands:
        errorfname = TEMP_PREFIX + ".cmdout"
        errorfile = open(errorfname, 'w')
        nullfile = open(os.devnull)
        p = subprocess.Popen(
            ps_command, shell=True,
            stdin=nullfile,
            stdout=subprocess.PIPE,
            stderr=errorfile
            )
        results = p.stdout.read().strip()
        p.stdout.close()
        errorfile.close()
        p.poll()
        try:
            os.remove(errorfname)
        except (IOError, OSError): pass

        if results:
            #For python version 3 and above, reading binary data, not str,
            #so we need to decode the output first:
            reslines = results.split('\n')
            if len(reslines) == 1:
                ps_out_fields = reslines[0].split()
                pid = int(ps_out_fields[1])
                progname = ps_out_fields[7]
                if '/' in progname:
                    progname = progname.split('/')[-1]
                return progname, pid
    return None, 0

def check_syslog_service_status(syslog_type):
    """
    Checks for syslog daemon status
    """
    process_name, pid = find_syslog_process()
    if process_name is None:
        pass
    else:
        global PROCESS_ID
        PROCESS_ID = pid
        syslog_process_name = get_syslog_process_name(syslog_type)
        if syslog_process_name == PROD_UNSUPPORTED:
            return False
        elif syslog_process_name == process_name:
            return True
    return False

def product_for_configuration(current_environment,
                              check_syslog_service = True):
    """
    Checks for multiple syslog daemon installed.
    """
    user_choice = 0

    supported_syslog_versions = current_environment['supported_syslog_versions']
    if len(supported_syslog_versions) > 1:
        printLog("Multiple versions of syslog detected on your system.")
        index = 0
        for (syslog_name, syslog_version)\
            in supported_syslog_versions.items():
            index += 1
            printLog("\t%d. %s(%s)" %
                            (index, syslog_name, syslog_version))

        for _ in range(5):
            try:
                str_msg = ("Please select (1-" + str(index) + ") to specify "
                           "which version of syslog you'd like configured. "
                           "(Default is 1): ")
                user_choice = int(usr_input(str_msg)) - 1
                break
            except ValueError:
                printLog ("Not a valid response. Please retry.")
        if user_choice < 0 or user_choice > (index):
            printLog(("Invalid choice entered. "
                             "Continue with default value."))
            user_choice = 0
    syslog_type = list( supported_syslog_versions.keys())[user_choice]
    service_status = check_syslog_service_status(syslog_type)
    if check_syslog_service:
        if not service_status or PS_FAIL in LOGGLY_QA:
            printLog(STR_SYSLOG_DAEMON_MESSAGE %
                            (syslog_type, syslog_type))
            sys_exit(reason = STR_SYSLOG_DAEMON_MESSAGE %
                     (syslog_type, syslog_type))
    printLog("Configuring %s-%s" %
            (syslog_type, supported_syslog_versions[syslog_type]))
    return syslog_type

def get_syslog_ng_source(default_config_file_path):
    """
    get source[that contain internal()] from config_file of syslog-ng.
    """
    source = ''
    command = r"sed -n -e '/[^#]internal\(\)/p' %s" % default_config_file_path
    output = os.popen(command).read()
    if output and len(output) > 0:
        command = (r"sed -n -e '/^\s*source\s*.*"
                   r"{/,/internal\(\)/p' %s" % default_config_file_path)
        output = os.popen(command).read()
        if output and len(output) > 0:
            compiled_regex = re.compile(r'source\s+(\S+).*[^#]\s*internal',
                                        re.MULTILINE | re.IGNORECASE)
            output_list = output.split('}')
            for st in output_list:
                result = compiled_regex.findall(st.replace('\n',''))
                if result:
                    return result[0]
    return source

def get_installed_syslog_configuration(syslog_id):
    """
    Fetching installed/configured syslog details
    """
    default_directory = ''
    auth_token = ''
    source = ''
    printLog("Reading default configuration directory path from (%s)."
                    % default_config_file_name.get(syslog_id))

    if syslog_id == PROD_RSYSLOG:
        include_pattern = r"^\s*[^#]\s*IncludeConfig\s+([\S]+/)"
        auth_token_pattern = (r"^\s*[^#]*\s*template\sLogglyFormat.*"
                              r"\[([a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]"
                              r"{4}-[a-z0-9]{4}-[a-z0-9]{12}).*")
    elif syslog_id == PROD_SYSLOG_NG:
        include_pattern = r"^\s*[^#]\s*Include\s+([\S]+/)"
        auth_token_pattern = (r"^\s*template\s+t_LogglyFormat\s*.*"
                              r"\[([a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]"
                              r"{4}-[a-z0-9]{4}-[a-z0-9]{12}).*\}")
    else:
        return { "path": default_directory,
                 "token": auth_token,
                 "source": source }

    include_compiled_regex = re.compile(include_pattern,
                                        re.MULTILINE | re.IGNORECASE)
    auth_token_compiled_regex = re.compile(auth_token_pattern,
                                           re.MULTILINE | re.IGNORECASE)

    with open(default_config_file_name.get(syslog_id), "r") as text_file:
        for line in text_file:
            if not default_directory:
                include_match_grp = include_compiled_regex.match(line.rstrip('\n'))
                if include_match_grp:
                    default_directory = include_match_grp.group(1)
                    default_directory = default_directory.lstrip('"').rstrip('"')

            if not auth_token:
                auth_token_match_grp = auth_token_compiled_regex.match\
                                       (line.rstrip('\n'))
                if auth_token_match_grp:
                    auth_token = auth_token_match_grp.group(1)

    if syslog_id == PROD_SYSLOG_NG:
        source = get_syslog_ng_source(default_config_file_name.get(syslog_id))

    return { "path": default_directory, "token": auth_token, "source": source }

def write_configuration(syslog_name_for_configuration,
                        authorization_details, user_type, noconfirm=False):
    """
    Function to create/modify configuration file
    """
    printLog("Reading configuration directory path....")
    syslog_id = get_syslog_id(syslog_name_for_configuration)
    syslog_configuration_details = get_installed_syslog_configuration(syslog_id)
    config_file = default_config_file_name.get(syslog_id)

    if len(syslog_configuration_details.get("path")) > 0:
        config_file = os.path.join(syslog_configuration_details.get("path"),
                                   LOGGLY_CONFIG_FILE)
        printLog(("The Loggly Syslog Configuration Script will "
                         "create a new configuration file %s") % config_file)
                         #(os.path.join
                         # (syslog_configuration_details.get("path"),
                         #              LOGGLY_CONFIG_FILE)))
        create_loggly_config_file(syslog_id,
                                  syslog_configuration_details,
                                  authorization_details, user_type, noconfirm)
        return config_file
    else:
        modify_syslog_config_file(syslog_id,
                                  syslog_configuration_details,
                                  authorization_details, user_type, noconfirm)
        return config_file

def remove_syslog_ng_source(default_config_file):

    command = (r"sed -n -e '/^\s*source\s\s*%s\s*{/,/};/p' %s" %
               (SYSLOG_NG_SOURCE, default_config_file))
    output = os.popen(command).read()
    if output and len(output) > 0:
        st = output.rstrip().replace('\n', '\\n#')
        os.popen((r"sed -i '/^\s*source\s\s*%s\s*{/,/};/c #%s' %s" %
                  (SYSLOG_NG_SOURCE, st, default_config_file)))

def remove_configuration(syslog_name_for_configuration):
    """
    Remove configuration files 22-loggly.conf and
    comment configuration settings in default config file
    """
    syslog_id = get_syslog_id(syslog_name_for_configuration)
    syslog_configuration_details = get_installed_syslog_configuration(syslog_id)
    default_config_file = default_config_file_name.get(syslog_id)
    if len(syslog_configuration_details.get("path")) > 0:
        loggly_file_path = os.path.join(
            syslog_configuration_details.get("path"),
            LOGGLY_CONFIG_FILE)
        if os.path.exists(loggly_file_path):
            printLog("Removing configuration file %s" % loggly_file_path)
            os.remove(loggly_file_path)
    printLog("Removing configuration settings from file %s for %s" % (
        default_config_file, syslog_name_for_configuration))
    if syslog_name_for_configuration == 'rsyslog':
        os.popen((r"sed -i 's/^\s*$template\s\s*LogglyFormat/"
                  "#$template LogglyFormat/g' %s" % default_config_file))
        pattern = (r"s/^\s*\*\.\*.*@@{0}:{1};LogglyFormat/"
                   r"#*.* @@{0}:{1};LogglyFormat/g").format(
                       LOGGLY_SYSLOG_SERVER, LOGGLY_SYSLOG_PORT)
        os.popen("sed -i '%s' %s" % (pattern, default_config_file))
    elif syslog_name_for_configuration == 'syslog-ng':
        os.popen((r"sed -i 's/^\s*template\s\s*LogglyFormat/"
                  r"#template LogglyFormat/g' %s" % default_config_file))
        os.popen((r"sed -i 's/^\s*destination\s\s*d_loggly/"
                  r"#destination d_loggly/g' %s" % default_config_file))
        output = os.popen((r'grep -P "^\s*log\s*{\s*source\(.*\);'
                           r'\s*destination\(d_loggly\);\s*};" -o %s'
                           % default_config_file)).read().rstrip()
        if output and len(output) > 0:
            os.popen((r"sed -i 's/^\s*{0}/#{0}/g' {1}".format
                      (output, default_config_file)))
        remove_syslog_ng_source(default_config_file)

def login():
    """
    Ask for Loggly credentials
    """
    printLog("Reading Loggly credentials from user....")
    printLog(USER_NAME_TEXT)
    user = usr_input("Loggly Username [%s]: " % getpass.getuser())
    if not user:
        user = getpass.getuser()

    if user:
        pprompt = lambda: (getpass.getpass("Password for %s: " % user))
        password = pprompt()
        for _ in range(2):
            if not password:
                password = pprompt()
            else:
                printLog(ACCOUNT_NAME_TEXT)
                msg = "Loggly Account Name [%s]:" % user
                subdomain = usr_input(msg).lower()
                if len(subdomain) <= 0 :
                    subdomain = user
                global USER
                global SUBDOMAIN
                USER = user
                SUBDOMAIN = subdomain
                return user, password, subdomain

    printLog("\nLoggly credentials not provided after maximum attempts.")
    printMessage("Aborting")
    sys.exit()


def get_json_data(url, user, password):
    """
    Retrieve Customer Token and Distribution ID from Loggly account
    """
    try:
        if AUTHENTICATION_FAIL in LOGGLY_QA:
            raise urllib_request.HTTPError(None, 401, None, None, None)
        req = urllib_request.Request(url)
        req.add_header("Accept", "application/json")
        req.add_header("Content-type", "application/json")
        user_passwd = base64.b64encode((user + ":" + password).encode('utf-8'))
        req.add_header("Authorization",
                       "Basic " + str(user_passwd.rstrip().decode("utf-8")))
        return json.loads(urllib_request.urlopen(req).read().decode("utf-8"))
    except urllib_request.HTTPError, e:
        if e.code == 401:
            msg = STR_AUTHENTICATION_FAIL_MESSAGE % USER
        else:
            msg = str(e)
        printLog("%s" % msg)
        sys_exit(reason = "%s" % msg)
    except urllib_request.URLError, e:
        printLog("%s" % e)
        sys_exit(reason = "%s" % e)
    except Exception, e:
        printLog("Exception %s" % e)
        sys_exit(reason = "%s" % e)

def get_auth(loggly_user, loggly_password, loggly_subdomain):
    url = (REST_URL_GET_AUTH_TOKEN % (loggly_subdomain, LOGGLY_DOMAIN))
    data = get_json_data(url, loggly_user, loggly_password)
    auth_tokens = data["tokens"]
    if not auth_tokens or AUTH_TOKEN_FAIL in LOGGLY_QA:
        printLog(STR_AUTHTOKEN_NOTFOUND_MESSAGE)
        sys_exit(reason = STR_AUTHTOKEN_NOTFOUND_MESSAGE)
    return auth_tokens

def get_auth_token(loggly_user, loggly_password, loggly_subdomain):
    """
    Create the request object and set some headers
    """
    try:
        if loggly_user and loggly_password:
            auth_tokens = get_auth(loggly_user,
                                   loggly_password,
                                   loggly_subdomain)
            # use the last token returned
            token = auth_tokens[-1]
            printLog('\nThis system is now configured to use '
                             '\"%s\" as its Customer Token.\n' % token)
            return token
        else:
            printLog("Loggly credentials could not be verified.")
            sys_exit(reason = "Loggly credentials could not be verified.")

    except Exception, e:
        printLog("Exception %s" % e)
        sys_exit(reason = "%s" % e)

def get_selected_syslog_version(syslog_id, syslog_versions):
    for (syslog_name, syslog_version) in syslog_versions:
        sys_id = get_syslog_id(syslog_name)
        if sys_id == syslog_id:
            return float(syslog_version)

def syslog_config_file_content(syslog_id, source, authorization_details):
    """
    Creating syslog content for configuring Loggly
    """
    content = ""
    if syslog_id == PROD_RSYSLOG:
        content = configuration_text.get(syslog_id) % (SUBDOMAIN,
                                    authorization_details.get("token"),
                                    authorization_details.get("id"),
                                    LOGGLY_SYSLOG_SERVER, LOGGLY_SYSLOG_PORT)
    elif syslog_id == PROD_SYSLOG_NG:
        printLog("Reading configured source from (%s) file."
                         % default_config_file_name.get(syslog_id))
        configured_source = source
        source_created = ''
        if len(configured_source) <= 0:
            syslog_version = get_selected_syslog_version(syslog_id, get_syslog_version())

            if  syslog_version > float(3.2):
                source_created = (SYSLOG_NG_SOURCE_TEXT_ABOVE_3_2
                                  % SYSLOG_NG_SOURCE)
            else:
                source_created = SYSLOG_NG_SOURCE_TEXT_3_2 % SYSLOG_NG_SOURCE
            configured_source = SYSLOG_NG_SOURCE
        content = configuration_text.get(syslog_id) % (SUBDOMAIN,
                                            source_created,
                                            authorization_details.get("token"),
                                            authorization_details.get("id"),
                                            LOGGLY_SYSLOG_SERVER,
                                            LOGGLY_SYSLOG_PORT,
                                            configured_source)
    else:
        printLog("Failed to create content for syslog id %s\n" % syslog_id)
        sys_exit(reason = ("Failed to create content for syslog id %s"
                           % syslog_id))

    return content + "\n"

def create_bash_script(content):
    """
    If user is not ROOT user then create bash script
    """
    file_path = os.path.join(os.getcwd(), LOGGLY_BASH_SCRIPT)
    config_file =  open(file_path, "w")
    config_file.write(content)
    config_file.close()
    #Remove invalid argument
    printLog(("Current user is not root user. Run script %s as root then "
                     "restart the syslog service"
                     % file_path))

def confirm(question):
    for _ in range(5):
        user_input = usr_input(question + ' [Yes|No]: ').lower()
        if  user_input in ['yes', 'ye', 'y']:
            return True
        elif user_input in ['no', 'n']:
            return False
        elif user_input:
            printLog("Not a valid input. Please retry.")

def create_loggly_config_file(syslog_id, syslog_configuration_details,
                              authorization_details, user_type, noconfirm=False):
    """
    Create Loggly configuration file
    """
    file_path = os.path.join(os.getenv("HOME"), LOGGLY_CONFIG_FILE)
    printLog("Creating configuration file at %s" % file_path)
    command_content = ""
    content = syslog_config_file_content(syslog_id,
                        syslog_configuration_details.get("source"),
                        authorization_details)
    try:
        config_file =  open(file_path, "w")
        config_file.write(content)
        config_file.close()
        destfile = os.path.join(syslog_configuration_details.get("path"),
                                LOGGLY_CONFIG_FILE)
        if user_type == NON_ROOT_USER:
            # print Instructions...
            content = "mv -f %s %s\n%s" % (file_path, destfile, command_content)
            create_bash_script(content)
        else:
            if os.path.isfile(destfile):
                msg = ("Loggly configuration file (%s) is already present. "
                       "Do you want to overwrite it?" % destfile)
                move = noconfirm or confirm(msg)
                if move:
                    os.popen("mv -f %s %s" % (file_path, destfile))
                    return
                elif move is False:
                    printMessage("Finished")
                    sys.exit(0)
                elif move is None:
                    printLog("Invalid input received after maximum attempts.")
                    printMessage("Aborting")
                    sys.exit(-1)

            else:
                os.popen("mv -f %s %s" % (file_path, destfile))
                return


    except IOError, e:
        printLog("IOError %s" % e)

def modify_syslog_config_file(syslog_id, syslog_configuration_details,
                              authorization_details, user_type, noconfirm=False):
    """
    Modifying configuration file by adding Loggly configuration text
    """
    comment = ("\n#Configuration modified by"
               "Loggly Syslog Configuration Script (%s)\n#\n"
               % datetime.now().strftime('%Y-%m-%dT%H:%M:%S'))

    content = syslog_config_file_content(syslog_id,
                                    syslog_configuration_details.get("source"),
                                    authorization_details)
    command_content = ''

    if len(syslog_configuration_details.get("token")) <= 0:
        question = ("\nThe Loggly configuration will be appended to (%s) file."
                    "\n\nWould you like to have the configuration file modified?"
                    % default_config_file_name.get(syslog_id))
        modify = noconfirm or confirm(question)
        if modify:
            backup_file_name = ("%s_%s.bak"
                        % (default_config_file_name.get(syslog_id),
                        datetime.now().strftime('%Y-%m-%dT%H:%M:%S')))

            with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                temp_file.write(content.encode('utf-8'))
            if user_type == ROOT_USER:
                os.popen(("cp -p %s %s"
                          % (default_config_file_name.get(syslog_id),
                             backup_file_name)))
                os.popen(("bash -c 'cat %s >> %s' "
                    % (temp_file.name,
                    default_config_file_name.get(syslog_id)))).read()
                os.unlink(temp_file.name)
            else:
                bash_script_content = ("cp -p %s %s "
                            "\nbash -c 'cat %s >> %s'\n%s"
                            % (default_config_file_name.get(syslog_id),
                               backup_file_name, temp_file.name,
                               default_config_file_name.get(syslog_id),
                               command_content))
                create_bash_script(bash_script_content)
            return backup_file_name
        elif modify is False:
            printLog("\nPlease add the following lines to "
                            "the syslog configuration file (%s)."
                            "\n\n%s%s"
                            % (default_config_file_name.get(syslog_id),
                               comment, content))
            printMessage("Finished")
            sys.exit(0)

    else:
        question = ("\nThis configuration currently uses \"%s\" as its Customer Token. "
                    "Do you want to overwrite it?"
                    % syslog_configuration_details.get("token"))
        overwrite = noconfirm or confirm(question)
        if overwrite:
            pattern = (r"s/[a-z0-9]\{8\}\-[a-z0-9]\{4\}\-[a-z0-9]"
                       r"\{4\}\-[a-z0-9]\{4\}\-[a-z0-9]\{12\}/%s/g"
                       % authorization_details.get("token"))
            if user_type == ROOT_USER:
                os.popen("sed -i '%s' %s" % (pattern,
                            default_config_file_name.get(syslog_id)))
            else:
                bash_script_content = "sed -i '%s' %s\n%s" % (pattern,
                            default_config_file_name.get(syslog_id),
                            command_content)
                create_bash_script(bash_script_content)
            return
        elif overwrite is False:
            printMessage("Finished")
            sys.exit(0)
            return

    printLog("Invalid input received after maximum attempts.")
    printMessage("Aborting")
    sys.exit(-1)

def check_selinux_service_status(syslog_type):
    """
    Run getenforce command and if output is 'Enforcing' then selinux is on
    else it is off.
    """
    selinux_status = ''
    command = 'getenforce'
    p = subprocess.Popen(command, shell=True, stderr=subprocess.PIPE,
                         stdout=subprocess.PIPE)
    p.wait()
    output = p.stdout.readlines()
    if output:
        selinux_status = output[0].rstrip()
    if selinux_status == 'Enforcing':
        printLog(("SELinux is on. Please disable it "
                        "and restart %s daemon manually." % syslog_type))
        return True
    else:
        return False

def run_command(command):
    """ runs a command and returns 3-tuple of
        exit code, list of stdout, and list of stderr
    """

    p = subprocess.Popen(command, shell=True,
        stderr=subprocess.PIPE, stdout=subprocess.PIPE)
    p.wait()

    return_code = p.returncode
    out = p.stdout.readlines()
    err = p.stderr.readlines() 

    return (return_code, out, err)

def restart_syslog_process(syslog_type, process_id):
    """
    Attempt to restart the syslog process assuming we have root priv
    """

    if run_command("pgrep supervisord")[0] == 0:
        printLog("Restarting with supervisorctl")
        command = "supervisorctl restart %s" % syslog_type
        code, out, err = run_command(command)
        if code == 0: return True

    printLog("Restarting with /etc/init.d/%s restart" % syslog_type)
    command = "/etc/init.d/%s restart" % syslog_type
    code, out, err = run_command(command)
    if code == 0: return True

    printLog("Restarting %s with SIGHUP" % syslog_type)
    command = "kill -HUP %d" % process_id
    code, out, err = run_command(command)
    if code == 0: return True

    return False

def confirm_syslog_restart(syslog_type, noconfirm=False):
    """
    Ask the user if it's okay to restart their syslog daemon
    """
    if PROCESS_ID != -1:
        question = ("Do you want the Loggly Syslog Configuration Script "
                    "to restart (SIGHUP) the syslog daemon.")
        result = noconfirm or confirm(question)
        if result:
            return restart_syslog_process(syslog_type, PROCESS_ID)
        elif result is False:
            printLog("Configuration file has been modified, "
                     "please restart %s daemon manually."
                     % syslog_type)
    else:
        printLog("Syslog daemon (%s) is not running. "
                         "Configuration file has been modified,"
                         "please start %s daemon manually."
                         % (syslog_type, syslog_type))
    return False


def doverify(loggly_user, loggly_password, loggly_subdomain):
    """
    Send test message to loggly server using logger and
    search this message to verify whether message is received or not.
    """
    printLog("Testing syslog configuration...")
    printLog("Sending a test message using logger.")
    unique_string = str(uuid.uuid4()).replace("-","")
    dummy_message = ("Testing that your log messages can make it to Loggly! %s"
                     % unique_string)
    printLog("Sending message (%s) to Loggly server (%s)"
                     % (dummy_message, LOGGLY_SYSLOG_SERVER))
    os.popen("logger -p INFO '%s'" % dummy_message).read()
    search_url = REST_URL_GET_SEARCH_ID % (loggly_subdomain, LOGGLY_DOMAIN, unique_string)
    # Implement REST APIs to search if dummy message has been sent.
    wait_time = 0
    while wait_time < VERIFICATION_SLEEP_INTERVAL:
        print("."),
        sys.stdout.flush()

        printLog("Sending search request. %s" % search_url)
        data = get_json_data(search_url, loggly_user, loggly_password)
        rsid = data["rsid"]["id"]
        search_result_url = REST_URL_GET_SEARCH_RESULT % (loggly_subdomain, LOGGLY_DOMAIN, rsid)
        printLog("Sending search result request. %s" % search_result_url)
        data = get_json_data(search_result_url, loggly_user, loggly_password)
        total_events = data["total_events"]
        if total_events >= 1 and VERIFICATION_FAIL not in LOGGLY_QA:
            print (".")
            printLog("******* Congratulations! Loggly is configured successfully.")
            break
        wait_time += VERIFICATION_SLEEP_INTERVAL_PER_ITERATION
        time.sleep(VERIFICATION_SLEEP_INTERVAL_PER_ITERATION)

    if wait_time >= VERIFICATION_SLEEP_INTERVAL:
        printLog(VERIFICATION_FAIL_MESSAGE)


def write_env_details(current_environment):
    """
    Write environment information to a file
    """
    try:
        file_path = os.path.join(os.getcwd(), LOGGLY_ENV_DETAILS_FILE)
        env_file = open(file_path, "w")
        env_file.write(os.popen("uname -a").read())
        env_file.write("Operating System: %s" %
                       (current_environment['operating_system']))
        env_file.write("\nSyslog versions:\n")
        if len(current_environment['syslog_versions']) > 0:
            for i, version in enumerate(current_environment['syslog_versions'], 1):
                env_file.write("\t%d.   %s(%s)" %
                            (i, version[0], version[1]))

        else:
            env_file.write("\tNo Syslog version Found......")

        env_file.close()
        printLog("Created environment details file at %s, "
                        "please visit http://loggly.com/docs/sending-logs-unixlinux-system-setup/ for more information." % file_path)
        printEnvironment(current_environment)
    except Exception, e:
        printLog("Error %s" % e)
        sys_exit(reason = "Error %s" % e)

def version_compatibility_check(minimum_version):
    """
    Checks for compatible Python version.
    """
    sys_version = ".".join(map(str, sys.version_info[:2]))
    if sys_version < minimum_version or PYTHON_FAIL in  LOGGLY_QA:
        printLog(STR_PYTHON_FAIL_MESSAGE %
                        (sys_version, minimum_version))

        sys_exit(reason = STR_PYTHON_FAIL_MESSAGE %
                 (sys_version, minimum_version))
    printLog(("Python version check successful: "
                     "Installed version is " + sys_version + ". "
                     "Minimum required version is " + str(minimum_version)))

def log(d, prio = 'info', facility = 'local0'):
    """
    Send a log message to Loggly;
    send a UDP datagram to Loggly rather than risk blocking.
    """
    msg_dict = {"version": OUR_VERSION}
    msg_dict.update(d)
    log_msg(json.dumps(msg_dict))

def log_msg(msg, prio='info', facility='local0'):
    global _LOG_SOCKET
    try:
        pri = LOG_PRIORITIES[prio] + LOG_FACILITIES[facility]
    except KeyError, errmsg:
        pass
    vals = {
      'pri':                pri,
      'version':            1,
      'timestamp':          datetime.isoformat(datetime.now()),
      'hostname':           socket.gethostname(),
      'app-name':           OUR_PROGNAME,
      'procid':             os.getpid(),
      'msgid':              '-',
      'loggly-auth-token':  LOGGLY_AUTH_TOKEN,
      'loggly-pen':         int(DISTRIBUTION_ID),
      'msg':                msg
    }

    fullmsg = ("<%(pri)s>%(version)s %(timestamp)s %(hostname)s "
               "%(app-name)s %(procid)s %(msgid)s "
               "[%(loggly-auth-token)s@%(loggly-pen)s] %(msg)s") % vals

    if not _LOG_SOCKET:  # first time only...
        _LOG_SOCKET = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    _LOG_SOCKET.sendto(fullmsg.encode('utf-8'),
                       (LOGGLY_SYSLOG_SERVER, LOGGLY_SYSLOG_PORT))

def perform_sanity_check_and_get_product_for_configuration(current_environment,
                                                check_syslog_service = True):
    printEnvironment(current_environment)
    perform_sanity_check(current_environment)
    syslog_name_for_configuration = product_for_configuration(
        current_environment,
        check_syslog_service = check_syslog_service)
    current_environment['syslog_name_for_configuration']\
                                = syslog_name_for_configuration
    return syslog_name_for_configuration

def install(current_environment):
    printLog("Setup started")
    # 1. Determine user type.
    user_type = get_user_type()
    # 2. Determine the environment in which it was invoked
    #(i.e. which distro, release, and syslog daemon has been deployed)
    syslog_name_for_configuration = \
    perform_sanity_check_and_get_product_for_configuration(current_environment)

    options = current_environment['options']
    if options.auth:
        token = options.auth
    else:
        loggly_user, loggly_password, loggly_subdomain = login()
        token = get_auth_token(loggly_user, loggly_password, loggly_subdomain)
    authorization_details = {'token': token, 'id': DISTRIBUTION_ID}
    # 4. If possible, determine the location of the syslog.conf file or
    #the syslog.conf.d/ directory.
    # Provide the location as the default and prompt the user for confirmation.

    # 5. Create custom configuration file and
    #place it in configuration directory path ($IncludeConfig),
    #default path for rsyslog will be /etc/rsyslog.d/
    modified_config_file = write_configuration(syslog_name_for_configuration,
                        authorization_details, user_type, options.noconfirm)
    selinux_status = check_selinux_service_status(syslog_name_for_configuration)
    if user_type == ROOT_USER and not selinux_status:
        # 6. SIGHUP the syslog daemon.
        confirm_syslog_restart(syslog_name_for_configuration, options.noconfirm)

    printLog(INSTALLATION_COMPLETED_TEXT)
    return syslog_name_for_configuration

def verify(current_environment):
    printLog("Verification started")
    perform_sanity_check_and_get_product_for_configuration(current_environment)
    loggly_user, loggly_password, loggly_subdomain = login()
    doverify(loggly_user, loggly_password, loggly_subdomain)
    printLog("Verification completed")

def uninstall(current_environment):
    printLog("Revert started")
    user_type = get_user_type()
    if user_type == NON_ROOT_USER:
        printLog("Please become root to revert")
        sys.exit()
    #No need to check syslog service for uninstall
    syslog_name_for_configuration = \
    perform_sanity_check_and_get_product_for_configuration(current_environment,
                                                check_syslog_service = False)
    remove_configuration(syslog_name_for_configuration)
    selinux_status = check_selinux_service_status(syslog_name_for_configuration)
    if not selinux_status:
        noconfirm = current_environment['options'].noconfirm
        confirm_syslog_restart(syslog_name_for_configuration, noconfirm)
    printLog("Revert completed")

def rsyslog_dryrun():
    results = get_stderr_from_process('rsyslogd -N1')
    errors = []
    for line in results:
        #Python3 and above throw error
        if 'UDP' in str(line):
            if 'enabled' in str(line):
                print("UDP Reception: Enabled")
            else:
                print("UDP Reception: Disabled")
        if 'error' in str(line).lower():
            errors.append(line)

    return errors

def get_stderr_from_process(command):
    process = subprocess.Popen(command, shell=True,
        stdout=subprocess.PIPE,
        stdin=open(os.devnull),
        stderr=subprocess.PIPE)
    results = process.stderr.readlines()
    process.stderr.close()
    return results

def syslog_ng_dryrun():
    results = get_stderr_from_process('syslog-ng -s')
    errors = []
    for line in results:
        #Python3 and above throw error
        if 'error' in str(line).lower():
            errors.append(line)
    return errors

def ensure_root():
    user_type = get_user_type()
    if user_type == NON_ROOT_USER:
        printLog("Current user is not root user")
        sys.exit()

def dryrun(current_environment):
    ensure_root()
    syslogd = perform_sanity_check_and_get_product_for_configuration(current_environment)
    printLog("Dryrun started for syslog version %s" % syslogd)

    token = getattr(current_environment['options'], 'auth') or 'foofey'
    noconfirm = current_environment['options'].noconfirm
    config_file = write_configuration(
            syslogd, {'token': token, 'id': DISTRIBUTION_ID }, 1, noconfirm)
    errors = []

    if syslogd == 'rsyslog':
        errors = rsyslog_dryrun()
    elif syslogd == 'syslog-ng':
        errors = syslog_ng_dryrun()

    remove_configuration(syslogd)
    if len(errors) > 0:
        printLog('\n!Dry Run FAIL: errors in config script!\n')
        for error in errors:
            printLog('  %s' % error)
    else:
        printLog("Dryrun completed successfully!!!")

module_dict = {
    'sysinfo' : write_env_details,
    'setup' :install,
    'revert' : uninstall,
    'verify' : verify,
    'dryrun' : dryrun
    }
def call_module(module_name, arg):
    module_dict[module_name](arg)

def loggly_help():
    loggly_user, loggly_password, loggly_subdomain = login()
    auth_tokens = get_auth(loggly_user, loggly_password, loggly_subdomain)
    logglyhelp = LOGGLY_HELP %  {
        'account': loggly_subdomain,
        'token': auth_tokens[-1],
        'dist_id': DISTRIBUTION_ID,
        'syslog_server': LOGGLY_SYSLOG_SERVER,
        'syslog_port': LOGGLY_SYSLOG_PORT,
        'syslog_source': SYSLOG_NG_SOURCE,
    }

    print(logglyhelp)


class PAOptionParser(OptionParser, object):
    def __init__(self, *args, **kw):
        self.posargs = []
        self.usage1 = kw['usage']
        super(PAOptionParser, self).__init__(*args, **kw)

    def add_posarg(self, *args, **kw):
        pa_help = kw.get("help", "")
        kw["help"] = SUPPRESS_HELP
        self.add_option("--%s" % args[0], *args[1:], **kw)
        self.posargs.append((args[0], pa_help))

    def get_usage(self, *args, **kwargs):
        self.usage = "%s" % (self.usage1)
        return super(self.__class__, self).get_usage(*args, **kwargs)

    def parse_args(self, *args, **kwargs):
        args = sys.argv[1:]
        args0 = []
        for p, v in zip(self.posargs, args):
            args0.append("--%s" % p[0])
            args0.append(v)
        args = args0 + args
        options, args = super(self.__class__, self).parse_args(args, **kwargs)
        if len(args) < len(self.posargs):
            msg = ('Missing value(s) for "%s"\n'
                   % ", ".join([arg[0] for arg in self.posargs][len(args):]))
            self.error(msg)
        return options, args


CMD_USAGE = '''
%prog <action> [option]
Action:
\tsetup        Configure your syslog setup
\trevert       Revert changes made by this syslog configuration script
\tverify       Verify the configuration explicitly
\tsysinfo      Print, write system information
\tloggly_help  Guideline for users for each step to configure syslog
\tdryrun       Perform configuration steps without modifying anything
Option:
\taccount      Name of loggly account being connected to
\tauth         Loggly auth token to use for logging
\tyes          Skip confirmations -- assume yes
'''.lstrip()

def parse_options():
    """
    Parse command line argument
    """

    parser = PAOptionParser(usage=CMD_USAGE)
    parser.add_posarg("action", dest='action', type="choice",
                      choices=('setup', 'revert', 'verify',
                               'sysinfo', 'loggly_help', 'dryrun'))
    parser.add_option("-y", "--yes", action="store_true", dest='noconfirm')
    parser.add_option("-s", "--account")
    parser.add_option("-a", "--auth")
    (options, args) = parser.parse_args()
    return options

def assert_os():
    platform = sys.platform
    # maybe also allow freebsd or sunos?
    if not platform.startswith('linux'):
        printLog("This script is only designed to run under linux, not %s" %
                platform)
        log({"platform": platform})
        sys.exit(1)

# Script starts here
def main():
    try:
        printMessage("Starting")
        options = parse_options()
        if json is None:
            version = get_python_version_string()
            log_msg('''{"python_version": "%s", "subdomain": "%s"}''' %
                    (version, options.subdomain))
            printMessage(STR_PYTHON_FAIL_MESSAGE %
                    (version, MINIMUM_SUPPORTED_PYTHON_VERSION))
            sys.exit(-1)
        global LOGGLY_QA
        LOGGLY_QA = os.environ.get('LOGGLY_QA', '').split()
        log({"status":"start", "args": vars(options)})
        current_environment = get_environment_details()
        current_environment['options'] = options
        log({
            "operating_system": current_environment['operating_system'],
            "syslog_versions": [ {"daemon": d, "version": v} for d,v in current_environment['syslog_versions'] ]
            })
        version_compatibility_check(MINIMUM_SUPPORTED_PYTHON_VERSION)
        assert_os()

        if options.action == 'loggly_help':
            loggly_help()
            sys.exit()

        call_module(options.action, current_environment)
        printMessage("Finished")
        log({"status":"finish", "args": vars(options)})
    except KeyboardInterrupt:
        #Python3 and above throw error
        print("\nAborting...")
        log({"status":"aborted", "args": vars(options), "msg":"KeyboardInterrupt" })
    except Exception, e:
        try:
            trace = traceback.format_exc()
            printLog(trace)
            log({"status":"failed", "traceback":trace, "args": vars(options)})
        finally:
            printLog('Configure script has errors')
            sys.exit(-1)

if __name__ == "__main__":
    main()
