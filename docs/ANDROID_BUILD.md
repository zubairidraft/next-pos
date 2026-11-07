# Next POS Mobile — building the Android app (APK)

The phone app lives in `apps/mobile` (Tauri 2). Its screens are in
`apps/desktop/src/mobile`, and it talks to the shop PC through `crates/pos-lan`.
The phone keeps no shop data: everything is saved on the PC.

## One-time setup on the Windows PC

1. Install **Android Studio** (https://developer.android.com/studio).
2. Android Studio → *More Actions* → *SDK Manager*:
   - *SDK Platforms*: tick **Android 14 (API 34)**.
   - *SDK Tools*: tick **Android SDK Build-Tools**, **NDK (Side by side)**,
     **Android SDK Command-line Tools**, **Android SDK Platform-Tools**. Apply.
3. Set these environment variables (Windows search → "Edit the system environment variables"):
   - `JAVA_HOME` = `C:\Program Files\Android\Android Studio\jbr`
   - `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`
   - `NDK_HOME` = `%LOCALAPPDATA%\Android\Sdk\ndk\<the version folder you see there>`
   Close and reopen the terminal afterwards.
4. Add the Android targets to Rust:
   ```
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```

## Build

```
cd "D:\Anti Gravity\Tools\pos\apps\desktop"
npm install

cd ..\mobile
npm install
npm run android:init      (first time only: creates src-tauri\gen\android)
npm run android:icons     (first time only: app icons)
npx tauri android build --apk --debug
```

The test APK is at
`apps\mobile\src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk`.
Copy it to the phone (WhatsApp to yourself / USB) and install it
(the phone asks to allow "install unknown apps" once).

Or with the phone connected by USB (USB debugging on): `npm run android:dev`
runs the app directly on the phone with live reload.

### Release APK for customers

A release APK must be signed with your own key. Make the key once and keep
it safe (losing it means customers cannot update the app):

```
keytool -genkey -v -keystore nextpos-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias nextpos
```

Then follow "Android code signing" in the Tauri docs
(https://v2.tauri.app/distribute/sign/android/) to point
`src-tauri\gen\android\app\build.gradle.kts` at the key through a
`keystore.properties` file (never commit that file or the .jks), and run:

```
npx tauri android build --apk
```

## Using it in the shop

1. On the PC: **More → Mobile phones → Turn on phone access**.
   If Windows asks whether Next POS may use the network, choose **Allow** for private networks.
2. **Connect a phone** shows a QR code (valid 10 minutes, works for one phone).
3. On the phone: open Next POS Mobile, type the phone's name, **Scan PC code**.

The phone must be on the same WiFi as the PC, and Next POS must be open on the PC.
The PC uses TCP port 47800 and UDP port 47801 (for finding the PC again after
the router gives it a new address).

## Testing the phone screens in a browser

Run `dev-agentation.bat` (starts the test server), then `dev-phone.bat`.
Open http://localhost:1421 with the browser's phone view. On the PC test page
(http://localhost:1420) turn on phone access and press **Connect a phone**;
in browser test mode the phone asks you to paste the pairing text instead of
using the camera (right-click the QR image → Inspect → copy `data-qr-text`).
