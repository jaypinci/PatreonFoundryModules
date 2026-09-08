import { MODULE_ID, Wallet } from "./data/wallet.js";
import { Ledger } from "./data/ledger.js";
import { registerEconomySettings } from "./data/economy.js";
import { registerSocketHandler } from "./sockets.js";
import { PlayerFinanceApp } from "./apps/player-app.js";
import { GMConfigApp } from "./apps/gm-config-app.js";
import { TransactionLogApp } from "./apps/transaction-log-app.js";

Hooks.once("init", () => {
  registerEconomySettings();
});

Hooks.once("ready", () => {
  registerSocketHandler();

  // Expose a tiny API — mirrors what other modules/macros will actually need.
  game.modules.get(MODULE_ID).api = {
    openPlayerApp: (actor) => new PlayerFinanceApp(actor).render(true),
    openGMConfig: () => new GMConfigApp().render(true),
    openTransactionLog: () => new TransactionLogApp().render(true),
    // Wallet (cash-on-hand) access for other modules — e.g. vendit.
    getWalletBalance: (actor) => Wallet.getBalance(actor),
    // Routed through the Ledger (not Wallet.adjust directly) so external
    // purchases actually show up in the GM's Transaction Log. Callers can
    // pass a `meta` object (e.g. { type: "vendorPurchase", source: "vendit",
    // itemName: "Widget" }) for a more descriptive log entry; defaults to
    // a generic "externalAdjustment" entry if omitted.
    adjustWallet: (actor, delta, meta = {}) => Ledger.transact(actor, {
      account: "wallet",
      delta,
      type: meta.type || "externalAdjustment",
      meta
    })
  };
});

// Scene control button: open the finance app for the selected token's actor.
Hooks.on("getSceneControlButtons", (controls) => {
  const tokenControls = controls.tokens;
  if (!tokenControls) return;
  tokenControls.tools.financialSystem = {
    name: "financialSystem",
    title: game.i18n.localize("financial-system-lite.app.title"),
    icon: "fa-solid fa-coins",
    button: true,
    visible: true,
    onClick: () => {
      const actor = canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
      if (!actor) {
        ui.notifications.warn(game.i18n.localize("financial-system-lite.errors.noActorSelected"));
        return;
      }
      new PlayerFinanceApp(actor).render(true);
    }
  };
  if (game.user.isGM) {
    tokenControls.tools.financialSystemGM = {
      name: "financialSystemGM",
      title: game.i18n.localize("financial-system-lite.gmConfig.title"),
      icon: "fa-solid fa-sliders",
      button: true,
      visible: true,
      onClick: () => new GMConfigApp().render(true)
    };
    tokenControls.tools.financialSystemLog = {
      name: "financialSystemLog",
      title: game.i18n.localize("financial-system-lite.log.title"),
      icon: "fa-solid fa-file-invoice-dollar",
      button: true,
      visible: true,
      onClick: () => new TransactionLogApp().render(true)
    };
  }
});
