#!/usr/bin/env sh
set -eu

sdk_path="${1:-${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}}"
if [ -z "$sdk_path" ] || [ ! -d "$sdk_path" ]; then
    echo 'Android SDK path is missing or not a directory' >&2
    exit 1
fi

if [ ! -e "$sdk_path/tools" ]; then
    command_line_tools="$sdk_path/cmdline-tools/latest"
    if [ ! -d "$command_line_tools" ]; then
        echo 'Android SDK has neither tools/ nor cmdline-tools/latest/' >&2
        exit 1
    fi
    ln -s "$command_line_tools" "$sdk_path/tools"
fi

if [ ! -x "$sdk_path/tools/bin/sdkmanager" ]; then
    echo 'Bubblewrap requires tools/bin/sdkmanager; Android SDK compatibility path is incomplete' >&2
    exit 1
fi

printf 'Bubblewrap Android SDK compatibility path ready: %s/tools/bin/sdkmanager\n' "$sdk_path"
