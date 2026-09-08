# Changelog

## 0.2.2 (current)
- Fixed NPC Quick Import dialog layout: the list of 100 manual entries was rendering unbounded (whole dialog grew to fit all rows, pushing the Import button off-screen) because the injected `<style>` block wasn't being applied by Foundry's dialog renderer. Rebuilt with inline styles and a fixed-height scrollable list instead.
- Reworked NPC Quick Import UX: opens straight to a searchable, browsable list of all 100 bundled *Chrome & Shadows* NPCs — click one to preview and import, no copying/pasting from the manual file required. The old paste-a-custom-entry flow is still available as a second tab for homebrew stat blocks.
- Fixed NPC Quick Import saves and gear not populating, and added auto-created readied weapon item:
  - Saves/morale were written to `system.saves`, but the NPC sheet reads them from a `combatInfo` flag — sheet always showed the default (10). Now written to the flag the sheet actually reads.
  - Gear text was only written into biography, never created as actual embedded items. Now split into individual gear items on the actor.
  - A weapon item is now auto-created from the parsed attack/damage line and set to "readied", so it shows up immediately in the NPC's attack list instead of needing to be built by hand.
- Fixed NPC Quick Import having no UI entry point — it was only reachable via `CWNSheets.NpcImporter.open()` in a macro/console. Added an "Import CWN NPC" button to the Actor Directory sidebar (GM only).
- Refactored NPC sheet to use readied-weapons lists for attacks.
- Moved combat info to a header vitals bar on the NPC sheet.
- Built out the full 12-type item sheet system.
- Fixed a ProseMirror editor race condition on item sheets caused by re-render on every field edit.
- Added attack roll hover breakdown (dice tooltip) on resolution cards.
- Added cyberdeck search bars.
- Cleanup pass: removed a dead unused diagnostic script, removed leftover debug console logging, fixed a reference bug in armor AC editing (`MODULE_ID` was undefined when entering a "+N" AC value).

## Earlier
- Initial standalone character, NPC, vehicle, and drone sheets on ApplicationV2.
- Targeted combat resolution system (hit/miss cards, DR → soak → HP damage pipeline).
- Frisk action for scanning target cyberware.
- NPC Quick Import from the Chrome & Shadows manual format.
