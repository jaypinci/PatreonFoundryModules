# Financial System Lite

A wallet, bank accounts, and a stock market for your Foundry VTT world — system-agnostic, actor-flag based, fully built on ApplicationV2.

Made by [FailingUp](https://www.patreon.com/FailingUp).

## Features

- **Wallet** — a simple cash-on-hand balance stored on each actor.
- **Banks** — GM-defined economies, each with any number of banks (with interest rates), that players can open accounts at and deposit/withdraw from.
- **Stock market** — GM-created stocks per economy, players can buy/sell shares, view an inline price-history chart, and the GM can shift prices manually or roll random market movement at five volatility tiers.
- **Transaction log** — every wallet/bank/stock action is logged per-actor and viewable in one filterable GM-facing table (by character, type, and date range).
- **Legacy import** — one-shot importer for worlds migrating from the older "Financial System" module.
- **Small public API** for other modules to read/adjust a player's wallet (used by [VENDIT](https://www.patreon.com/FailingUp) for point-of-sale purchases) — external adjustments are routed through the same ledger, so they show up in the transaction log too.

## Installation

1. In Foundry's **Add-on Modules** tab, click **Install Module**.
2. Paste the manifest URL: `<manifest URL goes here once hosted>`
3. Enable **Financial System Lite** in your world's module settings.

## Usage

- Players open their finances via the scene control toolbar (coin icon).
- GM configuration (economies, banks, stocks, volatility) is available via the sliders icon in scene controls, GM-only.
- GM transaction log is available via the invoice icon in scene controls, GM-only.
- If migrating from the old "Financial System" module, keep it active alongside this one and use **Import Legacy Data** in the GM Config app — then you can disable the legacy module.

## For module developers

Once active, this module exposes a small API:

```js
const fsl = game.modules.get("financial-system-lite")?.api;
fsl.getWalletBalance(actor);                 // -> number
fsl.adjustWallet(actor, delta, meta);        // meta: { type, source, itemName } — optional but recommended for a readable transaction log entry
```

## Compatibility

- Foundry VTT v13. System-agnostic — no specific game system required.

## Support / Feedback

Found a bug or have a feature idea? Reach out via [Patreon](https://www.patreon.com/FailingUp).

## License

See [LICENSE](LICENSE).
