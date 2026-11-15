#!/usr/bin/env bash
set -euo pipefail
mkdir -p android-diagnostics
collect() {
  adb logcat -d -t 3000 > android-diagnostics/logcat.txt 2>&1 || true
  adb shell dumpsys package com.android.chrome > android-diagnostics/chrome.txt 2>&1 || true
}
trap collect EXIT
adb devices -l > android-diagnostics/adb.txt
adb shell getprop > android-diagnostics/device.txt
sdkmanager --list_installed > android-diagnostics/sdk-packages.txt
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
adb shell svc power stayon true
pnpm test:android
