#!/usr/bin/env sh
set -eu

ARTIFACT_DIR="artifacts/twa-emulator"
mkdir -p "$ARTIFACT_DIR"
capture_logcat() {
    adb logcat -d > "$ARTIFACT_DIR/logcat.txt" 2>/dev/null || true
    adb shell dumpsys window windows > "$ARTIFACT_DIR/window.txt" 2>/dev/null || true
    adb exec-out screencap -p > "$ARTIFACT_DIR/final-screen.png" 2>/dev/null || true
}
cleanup() {
    capture_logcat
    rm -f android.keystore twa-manifest.json "$ARTIFACT_DIR/chrome-command-line"
}
trap cleanup EXIT INT TERM

if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "$ANDROID_HOME" ]; then
    echo 'Android SDK is not available in the emulator runner' >&2
    exit 1
fi
sh scripts/prepare-bubblewrap-android-sdk.sh "$ANDROID_HOME"

if [ -n "${TWA_SIGNED_APK_RUN_ID:-}" ]; then
    case "$TWA_SIGNED_APK_RUN_ID" in
        *[!0-9]*) echo 'Signed APK run ID must contain digits only' >&2; exit 1 ;;
    esac
    test "$(gh run view "$TWA_SIGNED_APK_RUN_ID" --repo "$GITHUB_REPOSITORY" --json conclusion --jq .conclusion)" = success
    test "$(gh run view "$TWA_SIGNED_APK_RUN_ID" --repo "$GITHUB_REPOSITORY" --json workflowName --jq .workflowName)" = 'TWA APK ビルド'
    gh run download "$TWA_SIGNED_APK_RUN_ID" --repo "$GITHUB_REPOSITORY" \
        -n machikoro-apk -D "$ARTIFACT_DIR/signed-apk"
    cp "$ARTIFACT_DIR/signed-apk/app-release-signed.apk" app-release-signed.apk
else
key_password="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))")"
keytool -genkeypair -noprompt -keystore android.keystore -alias android \
    -storepass "$key_password" -keypass "$key_password" -dname 'CN=CI TWA Smoke' \
    -keyalg RSA -keysize 2048 -validity 2
export BUBBLEWRAP_KEYSTORE_PASSWORD="$key_password"
export BUBBLEWRAP_KEY_PASSWORD="$key_password"

node scripts/create-twa-manifest.js --output twa-manifest.json --version-code 1
node - <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
const target = path.join(os.homedir(), '.bubblewrap');
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, 'config.json'), JSON.stringify({
    jdkPath: process.env.JAVA_HOME,
    androidSdkPath: process.env.ANDROID_HOME,
}));
NODE

expect <<'EXPECTEOF'
set timeout 900
log_user 1
spawn bubblewrap build
expect {
    -re {\(Y/n\)} { send "Y\r"; exp_continue }
    eof           { }
}
lassign [wait] pid spawnid os_error_flag value
exit $value
EXPECTEOF
fi

test -s app-release-signed.apk
adb root
adb wait-for-device
case "${TWA_EMULATOR_CUTOUT:-none}" in
    none) ;;
    tall)
        adb shell cmd overlay enable --user 0 com.android.internal.display.cutout.emulation.tall
        adb shell cmd overlay list --user 0 > "$ARTIFACT_DIR/cutout-overlays.txt"
        grep -F '[x] com.android.internal.display.cutout.emulation.tall' "$ARTIFACT_DIR/cutout-overlays.txt"
        ;;
    *) echo 'Unsupported TWA_EMULATOR_CUTOUT' >&2; exit 1 ;;
esac
adb shell am force-stop com.android.chrome || true
if [ -n "${TWA_SIGNED_APK_RUN_ID:-}" ]; then
    printf '%s\n' '_ --disable-fre --remote-debugging-port=9222' > "$ARTIFACT_DIR/chrome-command-line"
else
    cat > "$ARTIFACT_DIR/chrome-command-line" <<'CHROMEARGS'
_ --disable-fre --disable-digital-asset-link-verification-for-url="https://machikoro-9jv2.onrender.com" --remote-debugging-port=9222
CHROMEARGS
fi
adb push "$ARTIFACT_DIR/chrome-command-line" /data/local/tmp/chrome-command-line
adb install -r app-release-signed.apk
adb forward tcp:9222 localabstract:chrome_devtools_remote
adb shell monkey -p com.machikoro.game 1
node scripts/twa-emulator-smoke.js
