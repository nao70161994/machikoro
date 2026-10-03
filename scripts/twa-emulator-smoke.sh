#!/usr/bin/env sh
set -eu

ARTIFACT_DIR="artifacts/twa-emulator"
mkdir -p "$ARTIFACT_DIR"
capture_logcat() {
    adb logcat -d > "$ARTIFACT_DIR/logcat.txt" 2>/dev/null || true
    adb shell dumpsys window windows > "$ARTIFACT_DIR/window.txt" 2>/dev/null || true
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

key_password="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))")"
keytool -genkeypair -noprompt -keystore android.keystore -alias android \
    -storepass "$key_password" -keypass "$key_password" -dname 'CN=CI TWA Smoke' \
    -keyalg RSA -keysize 2048 -validity 2
export BUBBLEWRAP_SIGNING_STORE_PASSWORD="$key_password"
export BUBBLEWRAP_SIGNING_KEY_PASSWORD="$key_password"

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

test -s app-release-signed.apk
adb root
adb wait-for-device
adb shell am force-stop com.android.chrome || true
cat > "$ARTIFACT_DIR/chrome-command-line" <<'CHROMEARGS'
_ --disable-digital-asset-link-verification-for-url="https://machikoro-9jv2.onrender.com" --remote-debugging-port=9222
CHROMEARGS
adb push "$ARTIFACT_DIR/chrome-command-line" /data/local/tmp/chrome-command-line
adb install -r app-release-signed.apk
adb forward tcp:9222 localabstract:chrome_devtools_remote
adb shell monkey -p com.machikoro.game 1
node scripts/twa-emulator-smoke.js
