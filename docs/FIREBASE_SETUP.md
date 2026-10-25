# Firebase Setup

InsureDrive v1.5.5 now contains a complete FCM client integration and secure Supabase notification backend. Follow the current step-by-step guide:

**`docs/FIREBASE_NOTIFICATIONS_SETUP.md`**

The source includes a safe template `lib/firebase_options.dart`. Run:

```bash
dart pub global activate flutterfire_cli
flutterfire configure
```

from the project root to replace that template with the options for your own Firebase project.

Never place Firebase service-account private keys or Supabase service-role keys inside Flutter.
