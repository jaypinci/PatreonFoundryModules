/**
 * CWNFrisk — cwn-frisk.mjs
 *
 * Frisk action: lets a GM (or owner) scan a targeted token's actor
 * for cyberware implants. The scan result is whispered to the GM.
 *
 * Flow:
 *  1. Player clicks the Frisk button on their character sheet.
 *  2. CWNFrisk.initiate(actor) checks that exactly one non-self token
 *     is targeted.
 *  3. A small dialog gathers the Notice skill rank of the frisker and
 *     the target's Conceal modifier (optional).
 *  4. Rolls 2d6 + Notice rank vs DC (default 8, modified by Conceal).
 *  5. If the roller is a player, emits a socket event so the GM can
 *     resolve the whisper. If the user is a GM, resolves directly.
 *  6. Renders frisk-result.hbs and creates a whisper ChatMessage to GMs.
 */

const MODULE_ID  = 'New-CWN-Sheets';
const SOCKET_KEY = `module.${MODULE_ID}`;

// ─── Public API ───────────────────────────────────────────────────────────────

export class CWNFrisk {
  /**
   * Entry point — called from the sheet action handler.
   * @param {Actor} friskerActor  The actor whose sheet button was clicked.
   */
  static async initiate(friskerActor) {
    // ── 1. Validate target ──────────────────────────────────────────────────
    const targets = [...game.user.targets];
    if (targets.length !== 1) {
      ui.notifications.warn('FRISK | Target exactly one token before frisking.');
      return;
    }

    const targetToken = targets[0];
    const targetActor = targetToken.actor;

    if (!targetActor) {
      ui.notifications.warn('FRISK | Targeted token has no linked actor.');
      return;
    }

    if (targetActor.id === friskerActor.id) {
      ui.notifications.warn('FRISK | You cannot frisk yourself.');
      return;
    }

    // ── 2. Collect cyberware from target ────────────────────────────────────
    const implants = targetActor.items.filter(i => i.type === 'cyberware');

    // ── 3. Gather roll parameters from user ─────────────────────────────────
    const params = await CWNFrisk._showFriskDialog(friskerActor, targetActor);
    if (!params) return; // cancelled

    // ── 4. Roll ─────────────────────────────────────────────────────────────
    const roll = new Roll('2d6');
    await roll.evaluate();

    const total   = roll.total + params.noticeRank;
    const dc      = 8 + (params.concealMod ?? 0);
    const success = total >= dc;

    // ── 5. Build result data ────────────────────────────────────────────────
    const resultData = {
      friskerName: friskerActor.name,
      targetName:  targetActor.name,
      targetImg:   targetActor.img,
      roll:        roll.total,
      noticeRank:  params.noticeRank,
      total,
      dc,
      success,
      // Only reveal implants on success; send full list so GM always sees all
      implants:    success ? implants.map(i => ({
        name:   i.name,
        img:    i.img,
        type:   i.system?.type ?? 'None',
        strain: i.system?.strain ?? i.system?.systemStrain?.value ?? '—',
      })) : [],
      hasImplants: implants.length > 0,
      gmImplants:  implants.map(i => ({
        name:   i.name,
        img:    i.img,
        type:   i.system?.type ?? 'None',
        strain: i.system?.strain ?? i.system?.systemStrain?.value ?? '—',
      })),
    };

    // ── 6. Dispatch to GM ────────────────────────────────────────────────────
    if (game.user.isGM) {
      await CWNFrisk._postResult(resultData, roll);
    } else {
      // Emit socket for the GM to render the whisper
      game.socket.emit(SOCKET_KEY, {
        type:       'frisk',
        resultData,
        rollData:   roll.toJSON(),
      });
      ui.notifications.info(`FRISK | Roll sent to GM — ${success ? 'Success!' : 'Failed.'}`);
    }
  }

  // ─── Dialog ─────────────────────────────────────────────────────────────────

  static async _showFriskDialog(friskerActor, targetActor) {
    // Try to auto-detect the frisker's Notice skill rank
    const noticeItem   = friskerActor.items.find(
      i => i.type === 'skill' && i.name.toLowerCase() === 'notice'
    );
    const defaultNotice = noticeItem?.system?.rank ?? 0;

    const content = `
<div class="cwn-frisk-dialog">
  <div class="cwn-fd-header">
    <i class="fas fa-satellite-dish"></i>
    <span>FRISK PROTOCOL</span>
  </div>
  <div class="cwn-fd-subhead">Target: ${targetActor.name}</div>
  <div class="cwn-fd-fields">
    <div class="cwn-fd-field">
      <span class="cwn-fd-label">Notice Rank</span>
      <input class="cwn-fd-input cwn-fd-input-lg" id="frisk-notice"
             type="number" min="-1" max="4" value="${defaultNotice}" />
      <span class="cwn-fd-hint">frisker's skill rank</span>
    </div>
    <div class="cwn-fd-field">
      <span class="cwn-fd-label">Conceal Modifier</span>
      <input class="cwn-fd-input cwn-fd-input-lg" id="frisk-conceal"
             type="number" min="-5" max="10" value="0" />
      <span class="cwn-fd-hint">+modifier to DC (optional)</span>
    </div>
  </div>
  <div class="cwn-fd-note">
    <i class="fas fa-info-circle"></i>
    <span>Roll 2d6 + Notice vs DC 8 (+ conceal). On success, cyberware is revealed to GMs via whisper.</span>
  </div>
</div>`;

    return new Promise(resolve => {
      new Dialog({
        title:   `Frisk — ${targetActor.name}`,
        content,
        buttons: {
          roll: {
            icon:     '<i class="fas fa-dice"></i>',
            label:    'Roll Frisk',
            callback: html => {
              const noticeRank  = parseInt(html.find('#frisk-notice').val())  ?? 0;
              const concealMod  = parseInt(html.find('#frisk-conceal').val()) ?? 0;
              resolve({ noticeRank, concealMod });
            },
          },
          cancel: {
            icon:     '<i class="fas fa-times"></i>',
            label:    'Cancel',
            callback: () => resolve(null),
          },
        },
        default: 'roll',
        close:   () => resolve(null),
      }).render(true);
    });
  }

  // ─── Post result as whisper ──────────────────────────────────────────────────

  static async _postResult(resultData, roll) {
    const content = await renderTemplate(
      `modules/${MODULE_ID}/templates/chat/frisk-result.hbs`,
      resultData
    );

    const gmIds = game.users.filter(u => u.isGM).map(u => u.id);

    await ChatMessage.create({
      content,
      whisper: gmIds,
      speaker: { alias: 'FRISK TERMINAL' },
      style:   CONST.CHAT_MESSAGE_STYLES?.OTHER ?? 0,
      rolls:   [roll],
    });
  }
}

// ─── Socket registration ──────────────────────────────────────────────────────

export function registerFriskSocket() {
  game.socket.on(SOCKET_KEY, async (data) => {
    // Only the GM handles the frisk socket
    if (!game.user.isGM) return;
    if (data.type !== 'frisk') return;

    const roll = Roll.fromJSON(JSON.stringify(data.rollData));
    await CWNFrisk._postResult(data.resultData, roll);
  });
}
