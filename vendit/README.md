# VENDIT — Automated Retail Terminal

An immersive neon vending-machine shop UI for **Cities Without Number** (swnr system) in Foundry VTT. Turns a shop actor into a stylized point-of-sale terminal your players actually interact with, instead of clicking through a bare item sheet.

Made by [FailingUp](https://www.patreon.com/FailingUp).

## Requirements

- **Foundry VTT v13+**
- **System:** `swnr` (Cities Without Number)
- **[socketlib](https://foundryvtt.com/packages/socketlib)** — handles the player→GM purchase relay
- **[Financial System Lite](https://www.patreon.com/FailingUp)** — provides the actual player wallets VENDIT spends from. Both are made by the same author and designed to work together.

## Features

- **Point-of-sale shop UI** — searchable, filterable item list with a detail panel (image, stats, description) and a one-click dispense button.
- **GM-configurable categories** — edit the category list from Module Settings or an in-shop gear icon; no hardcoded categories to fight with.
- **Dynamic surge pricing** — GM toggle that applies a random price bump across the whole shop, with a visible in-shop indicator.
- **Lucky Spin** — a free slot-machine-style coupon roll (flat/percent discounts, free items, or a jackpot).
- **Mystery Box** — spend a flat fee for a randomized item (or items) drawn from the shop's stock, weighted by rarity tier.
- **Multiplayer-safe purchasing** — all transactions are relayed through the GM via socketlib, so wallet deductions and inventory changes are always server-authoritative.
- Every purchase (including Mystery Box) is logged in Financial System Lite's Transaction Log as a "Vendor Purchase," so the GM has a full paper trail.

## Installation

1. Install and enable **socketlib** and **Financial System Lite** first.
2. In Foundry's **Add-on Modules** tab, click **Install Module**.
3. Paste the manifest URL: `<manifest URL goes here once hosted>`
4. Enable **VENDIT** in your world's module settings.

## Usage

- Create an NPC or character actor to act as your shop, add items to its inventory, and assign the **VENDIT Shop Terminal** sheet to it.
- Open the sheet to get the terminal UI. Players select an account (their character) and a product, then hit **DISPENSE**.
- GMs can edit item categories, toggle surge pricing, delete items, and reassign categories from within the terminal.
- Configure the shared category list via **Module Settings → Configure Categories**.

## Compatibility

- Foundry VTT v13, `swnr` system only.

## Support / Feedback

Found a bug or have a feature idea? Reach out via [Patreon](https://www.patreon.com/FailingUp).

## License

See [LICENSE](LICENSE).
