# InsureDrive Android 14 GPS permission setup

The Android platform is generated with `flutter create` and then patched by
`scripts/configure_android_notifications.ps1`.

The resulting `android/app/src/main/AndroidManifest.xml` must contain these
permissions as direct children of `<manifest>`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

`ACCESS_BACKGROUND_LOCATION` is intentionally not added by default. Tracker
Mode starts location tracking from a visible screen and uses Geolocator's
visible foreground notification while the stream is active.

## Runtime flow

1. Open **Live Tracking → Test GPS With This Phone** or **Vehicle Tracker Mode**.
2. After the first frame, the app checks the current permission state.
3. If denied, `Geolocator.requestPermission()` is called exactly once for that
   screen instance so Android can display its native permission sheet.
4. If permanently denied, the UI offers **Open App Settings**.
5. If Location Services are disabled, the UI offers **Turn On GPS**.
6. If Approximate location is enabled, the UI asks the user to enable Precise
   Location in Android App Settings.
7. **Get Current Location** calls `Geolocator.getCurrentPosition()` with a
   timeout and displays the real coordinates without uploading anything until
   the device is paired.

Run this after preparing Android:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify_android_location_permissions.ps1
```
