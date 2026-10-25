# InsureDrive v1.5.5 — Firebase Push Notifications Setup

This release adds the application-side notification permission flow, FCM token registration, foreground notifications, safe notification-tap routing, notification preferences, Supabase token security, notification history, and secure Edge Function delivery.

Firebase project credentials are intentionally **not** bundled in the source. Connect your own Firebase project before expecting real device push notifications.

## 1. Flutter / Firebase packages

`pubspec.yaml` already contains:

- `firebase_core`
- `firebase_messaging`
- `flutter_local_notifications`
- `app_settings`

Run:

```cmd
flutter pub get
```

## 2. Create/connect the Firebase project

Install the FlutterFire CLI once:

```cmd
dart pub global activate flutterfire_cli
```

Sign in to Firebase CLI if needed, then from the InsureDrive Flutter project root run:

```cmd
flutterfire configure
```

Select the Firebase project and configure **Android** and **iOS**. The command replaces the included template `lib/firebase_options.dart` with project-specific generated options.

Never commit Firebase service-account private keys or Supabase service-role credentials to the Flutter source.

## 3. Android project generation

The full-source ZIP intentionally keeps platform folders portable. If `android\` is missing, run:

```cmd
flutter create . --platforms=android --org lk.insuredrive
```

Then run the included helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\configure_android_notifications.ps1
```

The helper adds/preserves:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

It also sets the installed app label to `InsureDrive`, enables core-library desugaring needed by the local-notification plugin, and retains the Windows Kotlin cache workaround used by this project.

After the script, run `flutterfire configure` if you have not already done so.

## 4. Android notification channels

The application creates these channels automatically:

| Channel ID | Name | Importance |
|---|---|---|
| `insurance_reminders` | Insurance Reminders | High |
| `vehicle_updates` | Vehicle Updates | Default |
| `security_alerts` | Security Alerts | High |
| `general_notifications` | General Notifications | Default |

Android users remain in control of sound, vibration, lock-screen visibility and channel settings through the operating system.

## 5. iOS setup

An iOS release build requires macOS + Xcode.

This release uses `app_settings` 8.x, whose Apple integration uses Flutter's
Swift Package Manager support. On the Mac enable it once before generating the
iOS platform:

```bash
flutter config --enable-swift-package-manager
```

If `ios/` is missing, on the Mac run:

```bash
flutter create . --platforms=ios
flutterfire configure
```

Open:

```bash
open ios/Runner.xcworkspace
```

In Xcode for the Runner target:

1. Select your Apple Developer Team.
2. Enable **Push Notifications** capability.
3. Enable **Background Modes** and check **Remote notifications**.
4. Keep normal notification permissions only. This project does not request Apple's Critical Alerts entitlement.

For foreground local-notification presentation, ensure `ios/Runner/AppDelegate.swift`
sets the `UNUserNotificationCenter` delegate. In a standard non-UIScene template,
add `import UserNotifications` and, inside `didFinishLaunchingWithOptions`, set:

```swift
UNUserNotificationCenter.current().delegate = self as? UNUserNotificationCenterDelegate
```

If the generated Flutter iOS template uses the newer UIScene lifecycle, follow
the current `flutter_local_notifications` iOS setup for that template rather
than forcing the legacy AppDelegate pattern.

In Firebase, configure APNs credentials for the iOS app before testing remote delivery.

## 6. Supabase database upgrade

In Supabase Dashboard → SQL Editor, run:

```text
supabase/NOTIFICATIONS_FCM_UPGRADE_RUN_THIS.sql
```

Then verify with:

```text
supabase/VERIFY_NOTIFICATIONS_FCM.sql
```

The upgrade adds/enhances:

- `device_tokens.device_id`
- `device_tokens.last_seen_at`
- secure `register_device_token(...)`
- secure `unregister_device_token(...)`
- `notification_preferences`
- generic notification history fields for vehicle/policy/security events
- duplicate keys for safe reminder delivery
- RLS policies for user-owned preferences and device tokens

## 7. Firebase server credentials in Supabase

The FCM HTTP v1 sender runs only in Supabase Edge Functions. Create a Firebase service account for server-side messaging and keep its values in Supabase Secrets.

Example commands (replace placeholders locally; do not commit the real values):

```cmd
npx supabase secrets set FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
npx supabase secrets set FIREBASE_CLIENT_EMAIL=YOUR_SERVICE_ACCOUNT_EMAIL
npx supabase secrets set FIREBASE_PRIVATE_KEY="YOUR_PRIVATE_KEY_WITH_\\n_NEWLINES"
```

Recommended reminder schedule values:

```cmd
npx supabase secrets set REMINDER_DAYS="10,7,3,1,0,-1"
```

If your scheduled function uses a cron secret, retain your existing `CRON_SECRET`.

## 8. Deploy Edge Functions

The new dispatcher:

```cmd
npx supabase functions deploy send-push-notification
```

The reminder functions are updated in this release, so redeploy them too:

```cmd
npx supabase functions deploy send-policy-reminder
npx supabase functions deploy check-expiring-policies
```

Account-status notifications are also emitted by the updated administrator function before suspended-account tokens are disabled, so redeploy it too:

```cmd
npx supabase functions deploy admin-manage-users
```

`record-login-activity` does not need redeployment for this notification upgrade.

## 9. First-run permission flow

After a successful login on a configured Android/iOS build, InsureDrive shows its own explanation once:

**Enable Notifications** → **Allow Notifications**

Only after the user chooses Allow does the app request the operating-system notification permission. Choosing **Not Now** does not repeatedly reopen the explanation on every app start.

If notification access is later disabled in the operating-system settings, use:

`Notification Settings` → `Open Settings`

## 10. Device token lifecycle

When permission is allowed and the user is authenticated:

1. FCM provides the registration token.
2. InsureDrive calls the secure `register_device_token` database function.
3. The token is bound to `auth.uid()`.
4. Token refresh is handled automatically.
5. On logout/session switch the current token binding is removed, preventing a later user on the same phone from receiving the previous user's private pushes.
6. Server delivery deactivates tokens reported by FCM as unregistered.

## 11. Notification preferences

Open the drawer → **Notification Settings**.

The user can control:

- Insurance Reminders
- Vehicle Updates
- Policy Updates
- Security Alerts
- General Notifications

Defaults are enabled. Server-side Edge Functions also check these preferences; hiding a Flutter switch is not treated as the security boundary.

## 12. Administrator notification tests

Administrator only:

`Notification Settings` → `Notification Test`

Available tests:

- Test Insurance Reminder
- Test Vehicle Assignment
- Test Security Alert

The server validates the authenticated role and sends the test only to the current administrator account's active devices.

## 13. Insurance reminder schedule

The scheduled function defaults to:

- 10 days before expiry
- 7 days before expiry
- 3 days before expiry
- 1 day before expiry
- expiry day (`0`)
- one-time expired follow-up (`-1`, meaning the policy expired yesterday when that daily run occurs)

The database duplicate constraint/dedupe key prevents the scheduled job from repeatedly creating the same policy/day reminder.

## 13.1 Security-event coverage

The secure push dispatcher supports account/access/security events, including
`account_status_changed`, `access_changed`, `security_alert`, and
`password_changed`. A password-change notification is emitted only when the
application has a trusted password-change workflow that calls the dispatcher;
this release does not invent a password-change event when none occurred.

"New login from a new device" is intentionally not emitted from unreliable
browser/user-agent guesses. Add it only when a trustworthy device identity is
available from your authentication/device-registration workflow.

## 14. Foreground / background / terminated behavior

- **Foreground:** FCM `onMessage` is converted into a local notification using the correct Android channel.
- **Background:** the FCM notification payload is displayed by the platform; tapping it routes through authenticated InsureDrive UI.
- **Terminated:** the initial FCM message is queued until the authenticated app shell exists, then the app routes to Policies, Vehicles, Profile/Security, or Notifications as appropriate.

Notification payloads contain IDs and event types only. Sensitive details are fetched inside the authenticated app through Supabase/RLS.

## 15. Build and test Android APK

Run:

```cmd
flutter clean
flutter pub get
flutter analyze
flutter test
flutter run
```

On a physical Android device, verify:

1. Sign in.
2. Permission explanation appears once.
3. Tap **Allow Notifications**.
4. Android notification permission is granted (Android 13+).
5. Open Notification Settings and confirm `Notifications Allowed`.
6. As Administrator, send a test notification.
7. Put the app in background and repeat the server test.
8. Close the app and test a push again.
9. Tap each notification and confirm authentication/RLS are still respected.
10. Log out, sign in as a different user on the same phone and confirm notifications belong only to the new account.

Build release APK:

```cmd
flutter build apk --release
```

Output:

```text
build\app\outputs\flutter-apk\app-release.apk
```

## 16. Important privacy rule

Do not send NIC numbers, full addresses, access tokens, passwords, private documents, exact GPS coordinates or other highly sensitive data in lock-screen notification text. Keep the push short and fetch authorized detail only after the user opens InsureDrive.
