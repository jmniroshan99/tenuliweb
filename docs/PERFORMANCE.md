# Performance Decisions

This starter intentionally avoids heavy UI dependencies.

- Native Material 3 widgets: smaller dependency surface and predictable rendering.
- `ListView.builder`: vehicle, policy and alert lists are lazily built.
- Bounded animations: reveal/splash animations are short and do not run forever.
- Repaint isolation: loading shimmer/skeleton is inside `RepaintBoundary`.
- Skeleton loading: perceived loading is smoother than blocking the whole screen.
- `const` constructors: used where possible to reduce widget recreation work.
- No remote fonts on startup: avoids delaying first meaningful paint.
- No large bundled images: fast startup and smaller app asset payload.
- Indexed screen objects: major screens are retained instead of reconstructed from scratch on every navigation tap.
- Accessibility: smart animations can be turned off in Settings and system reduced-animation preference is respected where used.
- Database indexes: user, vehicle and expiry-date lookups have targeted PostgreSQL indexes.
- Idempotent reminders: a unique database key prevents duplicate reminder records for a policy/day threshold.

## Production improvements

For a large fleet/customer base, add server-side pagination, cursor-based policy history, thumbnails instead of full-size vehicle images, upload compression, observability, crash reporting and database query monitoring.
