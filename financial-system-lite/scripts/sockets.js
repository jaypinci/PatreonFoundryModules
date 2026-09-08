import { MODULE_ID } from "./data/wallet.js";
import { Stocks } from "./data/economy.js";

const SOCKET_NAME = `module.${MODULE_ID}`;

/**
 * Unlike the original module, this is the ONLY thing that goes through
 * a GM relay: sharesAvailable is the one piece of state two players
 * could race on simultaneously. Everything else (wallet, accounts,
 * portfolio) writes directly to actor flags the player already owns.
 */
export function registerSocketHandler() {
  game.socket.on(SOCKET_NAME, async (payload) => {
    if (!game.user.isGM) return;
    if (payload.action === "adjustShares") {
      try {
        await Stocks._adjustSharesAvailable(payload.stockId, payload.delta);
      } catch (err) {
        console.error(`${MODULE_ID} | share adjustment failed`, err);
      }
    }
  });
}

export async function requestShareAdjustment(stockId, delta) {
  if (game.user.isGM) {
    return Stocks._adjustSharesAvailable(stockId, delta);
  }
  game.socket.emit(SOCKET_NAME, { action: "adjustShares", stockId, delta });
}
