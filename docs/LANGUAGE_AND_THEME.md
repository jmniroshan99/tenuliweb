# Sinhala / English and Theme System

InsureDrive v1.5.3 supports English (`en`) and Sinhala (`si`) at application level.
The selected language is saved locally as `ui_language`. The selected theme is
saved as `ui_theme` (`dark` or `light`).

## Architecture

- `lib/l10n/app_localizations.dart` — English-to-Sinhala UI dictionary,
  dynamic label translation and `LText` localized text widget.
- `lib/state/insurance_controller.dart` — persists and exposes language/theme.
- `lib/theme/app_theme.dart` — Midnight Blue dark theme, clean electric-blue
  light theme, and Sinhala-safe font fallback.
- `lib/main.dart` — Material localization delegates, supported locales,
  persisted locale and theme mode.

## Typography

No external font file is bundled. Flutter uses the platform font and the
following fallback stack for Sinhala glyphs: Noto Sans Sinhala, Nirmala UI,
Iskoola Pota, Noto Sans, Roboto and Arial. Headings use strong 800–900 weights
and body text uses a readable 600 weight.

## Adding a new label

Use `LText('Canonical English text')` for visible text or
`context.tr('Canonical English text')` for string-only widget properties such
as `labelText`, `hintText`, `tooltip` and navigation labels. Add the Sinhala
translation to `_si` in `app_localizations.dart`.

## Security

Changing language or theme affects UI only. It does not change Supabase roles,
RLS, permissions, authentication, audit logs or insurance data.
