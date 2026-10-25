# InsureDrive Midnight Electric Blue Theme

This release applies the supplied dark blue/mobile UI reference across the whole InsureDrive application while keeping the existing Material 3 structure and lightweight animations.

## Palette

| Purpose | Hex |
|---|---|
| Deep background | `#050B18` |
| Main background | `#071226` |
| Navy | `#0A1D57` |
| Surface | `#0C1931` |
| Surface low | `#0E1E3A` |
| Surface mid | `#10264A` |
| Surface high | `#14315D` |
| Electric blue | `#2168ED` |
| Bright blue | `#3984FF` |
| Soft blue | `#6192E9` |
| Pale blue | `#CADAFB` |
| Primary text | `#F3F7FF` |
| Secondary text | `#A9BAD9` |
| Outline | `#29466F` |

Semantic status colors remain distinct for usability:
- Success: `#45D69A`
- Warning: `#FFB454`
- Danger: `#FF6680`

## Global treatment

- Dark navy background on every screen.
- Subtle electric-blue radial glows behind the navigator/scaffolds.
- Layered navy surfaces instead of flat grey cards.
- Electric-blue primary actions.
- Blue-highlighted selected navigation destinations.
- Blue focus borders for forms.
- Dark navy dialogs, bottom sheets and drawers.
- Blue-glow splash and login shield.
- Gradient dashboard/profile hero cards.
- Restrained shadows and glow to keep rendering efficient.

## Theme source

The centralized theme is in:

`lib/theme/app_theme.dart`

Avoid adding new hard-coded brand colors in individual screens. Prefer:

```dart
final scheme = Theme.of(context).colorScheme;
```

For semantic or specific brand accents use `AppColors` from `app_theme.dart`.

## Performance

The theme does not use external background images, blur filters, video or continuously animated shaders. The global backdrop uses standard Flutter gradients and two static radial glows. Existing skeleton and transition animations remain unchanged.
