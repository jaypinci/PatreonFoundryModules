# New CWN Sheets

Standalone, fully custom character sheets for **Cities Without Number**, built on Foundry VTT v13's ApplicationV2 framework. Replaces the default `swnr` actor sheets for CWN games with purpose-built, maintainable sheets and a dark neon aesthetic.

Requires the [SWN/CWN system (`swnr`)](https://foundryvtt.com/packages/swnr) — this module supplies sheets only, not the underlying data model.

## Features

- **Character sheet** — favorites, cyberware grouped by body location, inventory search, collapsible sections, inline skill/armor editing, credit tracking, luck saves with a slot-machine flourish.
- **Cyberdeck mode** — an alternate full-panel sheet view for netrunning: deck catalogue, program slots, access tracker, and program roll checks.
- **NPC sheet** — readied-weapon attack lists, a header vitals bar, morale/save checks, and quick skill rolls.
- **NPC Quick Import** — paste an entry from the bundled *Chrome & Shadows* NPC manual (100 ready-to-use street NPCs) and get a fully populated actor with embedded skill/feature items.
- **Vehicle & Drone sheets** — systems, weapons, cargo, and crew/pilot assignment.
- **12 item sheets** — one per CWN/SWN item type (weapon, armor, gear, skill, feature, cyberware, power, program, asset, and the three ship-component types), each with a live ProseMirror description editor.
- **Targeted combat resolution** — attack rolls resolve against targeted tokens with a styled hit/miss card, AC comparison, and one-click damage application through the full DR → armor soak → module soak → NPC soak → HP pipeline.
- **Frisk action** — scan a target's cyberware and whisper the result to the GM.

## Installation

1. In Foundry's **Add-on Modules** tab, install via manifest URL (see below) or by placing this folder in your `Data/modules` directory.
2. Enable **New CWN Sheets** in your world's module settings.
3. CWN character and NPC actors will use the new sheets automatically; existing actors keep their data — only the sheet UI changes.

## Compatibility

- Foundry VTT **v13** (verified on 13.348)
- Requires the `swnr` system

## Support

This module is free to use for everyone — GPL-3.0-or-later. If you'd like to support development, tips are welcome (but never required) via [Patreon](https://www.patreon.com/cw/FailingUp).

Found a bug or have a feature request? Reach out via Patreon or the module's support channel.

## License

GPL-3.0-or-later. See `LICENSE.md`.
