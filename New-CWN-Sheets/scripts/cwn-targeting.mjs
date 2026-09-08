/**
 * CWN Targeted Combat — cwn-targeting.mjs
 *
 * Targeted attack resolution workflow for CWN/SWN.
 *
 * FLOW
 * ────
 * 1. Attacker rolls weapon via normal system dialog — a standard swnr
 *    attack-roll chat card appears.
 * 2. This module's renderChatMessageHTML hook detects attack cards and injects
 *    a "⊕ Resolve vs Target" button.
 * 3. Clicking it reads the hit total, compares against each targeted token's
 *    AC, and posts a styled CWN Resolution card per target.
 * 4. The Resolution card shows HIT / MISS, current HP/soak, damage total
 *    (if pre-rolled), and action buttons:
 *      [Apply Full]  [Apply Half]  [Apply Double]  [Heal]  [Enter Amount]
 * 5. Applying damage goes through the full CWN pipeline:
 *      DR (armor.dr) → armor soak → module-flag soak → NPC base soak → HP
 */

const MODULE = 'New-CWN-Sheets';

// ═══════════════════════════════════════════════════════════════════════════
//  CWNTargetedAttack
// ═══════════════════════════════════════════════════════════════════════════

export class CWNTargetedAttack {

  // ── Entry: resolve an existing attack card vs current targets ─────────────

  static async resolveVsTargets(message, cardEl) {
    const hitTotalEl = cardEl.querySelector('.roll-hit .dice-total');
    const hitTotal   = hitTotalEl ? parseInt(hitTotalEl.textContent.trim()) : null;
    if (hitTotal === null || isNaN(hitTotal)) {
      ui.notifications.warn('Could not read hit-roll total.');
      return;
    }

    const dmgTotalEl = cardEl.querySelector('.roll-damage .dice-total');
    const dmgTotal   = dmgTotalEl ? parseInt(dmgTotalEl.textContent.trim()) : null;

    // Grab the raw dice formula + native Foundry tooltip from the hidden
    // attack card before it's discarded — lets the resolution card show
    // players exactly what was rolled (1d20 + mods, individual die faces)
    // on hover, same trick used for skill-check cards elsewhere.
    const hitFormula     = cardEl.querySelector('.roll-hit .dice-formula')?.textContent?.trim() ?? '';
    const hitTooltipHTML = cardEl.querySelector('.roll-hit .dice-tooltip')?.outerHTML ?? '';

    const storedTargets = message.getFlag(MODULE, 'targets') ?? [];
    if (!storedTargets.length) {
      ui.notifications.warn('No targets found on this attack. Make sure a token is targeted before rolling.');
      return;
    }

    const weaponName   = CWNTargetedAttack._extractWeaponName(message);
    const speakerActor = message.speaker?.actor
      ? (game.actors.get(message.speaker.actor) ?? null)
      : null;

    // Extract trauma die formula from the weapon item on the attacker
    const traumaDie = CWNTargetedAttack._extractTraumaDie(speakerActor, weaponName);

    for (const { tokenId, actorId } of storedTargets) {
      const token = canvas?.tokens?.placeables.find(t => t.id === tokenId) ?? null;
      const actor = token?.actor ?? game.actors.get(actorId) ?? null;
      if (!actor) continue;

      const ac           = CWNTargetedAttack._getAC(actor);
      const hit            = hitTotal >= ac;
      const soakInfo       = CWNTargetedAttack._getSoakInfo(actor);
      const vehicleArmor   = CWNTargetedAttack._getVehicleArmor(actor);
      const hp             = { value: actor.system.health?.value ?? 0, max: actor.system.health?.max ?? 0 };
      const delta    = hitTotal - ac;

      // Roll trauma die on a hit if we have a formula
      let traumaResult = null;
      if (hit && traumaDie) {
        try {
          const traumaRoll = await new Roll(traumaDie).evaluate();
          traumaResult = { total: traumaRoll.total, formula: traumaDie, roll: traumaRoll };
        } catch (e) {
          console.warn(`CWN Sheets | Could not roll trauma die '${traumaDie}':`, e);
        }
      }

      const content = CWNTargetedAttack._buildResolutionCard({
        attackerName: speakerActor?.name ?? 'Attacker',
        weaponName,
        targetName:  token?.name ?? actor.name,
        targetId:    tokenId,
        actorId:     actor.id,
        ac, hitTotal, delta, hit, dmgTotal, soakInfo, hp, traumaResult,
        hitFormula, hitTooltipHTML,
      });

      const rolls = traumaResult?.roll ? [traumaResult.roll] : [];

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: speakerActor ?? undefined }),
        content,
        rolls,
        flags: { [MODULE]: { type: 'resolution', actorId: actor.id, tokenId } },
      });
    }
  }

  // Extract trauma die formula from attacker’s matching weapon item.
  // CWN/swnr stores it as system.trauma.die, system.traumaDie, or system.damage.die
  // depending on system version. We check all known paths.
  static _extractTraumaDie(actor, weaponName) {
    if (!actor?.items) return null;
    // Find the weapon by name match
    const weapon = actor.items.find(i =>
      (i.type === 'weapon' || i.type === 'item') &&
      i.name?.toLowerCase() === weaponName?.toLowerCase()
    ) ?? actor.items.find(i => i.type === 'weapon'); // fallback: first weapon
    if (!weapon) return null;

    const s = weapon.system;
    // Check known swnr schema paths for trauma die
    return s?.trauma?.die
      ?? s?.traumaDie
      ?? s?.traumaDice
      ?? s?.damage?.traumaDie
      ?? null;
  }

  // ── Apply damage to an actor (full DR → armor soak → flag soak → NPC soak → HP pipeline) ──

  static async applyToActor(actorId, tokenId, amount) {
    const token = canvas?.tokens?.placeables.find(t => t.id === tokenId) ?? null;
    if (!token) { ui.notifications.error('Target token not found.'); return; }
    
    // Use the token's actor, not the base actor from game.actors
    const actor = token.actor;
    if (!actor) { ui.notifications.error('Target actor not found.'); return; }

    // Healing bypasses the damage pipeline entirely
    if (amount < 0) {
      const old   = actor.system.health.value;
      const newHp = Math.min(old + Math.abs(amount), actor.system.health.max);
      await actor.update({ 'system.health.value': newHp });
      CWNTargetedAttack._floatText(token, newHp - old, '0x00FF00');
      if (actor.sheet?.rendered) actor.sheet.render();
      ui.notifications.info(`${actor.name} healed ${newHp - old}.`);
      return;
    }

    let remaining = amount;

    // ── Step 1: Vehicle armor (flat DR on vehicle actors) ─────────────────
    if (remaining > 0 && actor.type === 'vehicle') {
      const vArmor = CWNTargetedAttack._getVehicleArmor(actor);
      if (vArmor > 0) {
        const absorbed = Math.min(vArmor, remaining);
        remaining = Math.max(0, remaining - vArmor);
        CWNTargetedAttack._floatText(token, absorbed, '0x00e8ff');
      }
    }

    // ── Step 2: DR (damage reduction from equipped armor) ──────────────────
    if (remaining > 0) {
      const drSum = (actor.items ?? [])
        .filter(i => i.type === 'armor' && CWNTargetedAttack._isArmorEquipped(i) && i.system.dr > 0)
        .reduce((acc, i) => acc + i.system.dr, 0);
      if (drSum > 0) remaining = Math.max(0, remaining - drSum);
    }

    // ── Step 2: CWN armor item soak (system.soak on armor items) ──────────
    if (remaining > 0 && CWNTargetedAttack._useCWNArmor()) {
      const soakArmors = (actor.items ?? []).filter(i =>
        i.type === 'armor' && CWNTargetedAttack._isArmorEquipped(i) && (i.system.soak?.value ?? 0) > 0
      );
      for (const arm of soakArmors) {
        if (remaining <= 0) break;
        const sv = arm.system.soak.value;
        const nv = Math.max(sv - remaining, 0);
        const absorbed = sv - nv;
        remaining -= absorbed;
        // Update via actor.updateEmbeddedDocuments to work correctly for both
        // linked and unlinked (synthetic) token actors.
        await actor.updateEmbeddedDocuments('Item', [{ _id: arm.id, 'system.soak.value': nv }]);
        CWNTargetedAttack._floatText(token, absorbed, '0xFFA500');
      }
    }

    // ── Step 3: Module-flag soak (the soak tracker on the character sheet header) ──
    if (remaining > 0) {
      const flagSoak = actor.getFlag(MODULE, 'soak');
      if (flagSoak && (flagSoak.value ?? 0) > 0) {
        const sv = flagSoak.value;
        const absorbed = Math.min(sv, remaining);
        remaining -= absorbed;
        const nv = sv - absorbed;
        await actor.setFlag(MODULE, 'soak', { ...flagSoak, value: nv });
        CWNTargetedAttack._floatText(token, absorbed, '0xFFA500');
      }
    }

    // ── Step 4: NPC base soak (system.baseSoakTotal) ──────────────────────
    if (remaining > 0 && actor.type === 'npc') {
      const sv = actor.system.baseSoakTotal?.value ?? 0;
      if (sv > 0) {
        const nv = Math.max(sv - remaining, 0);
        remaining -= sv - nv;
        await actor.update({ 'system.baseSoakTotal.value': nv });
        CWNTargetedAttack._floatText(token, sv - nv, '0xFFA500');
      }
    }

    // ── Step 5: HP ────────────────────────────────────────────────────────
    if (remaining > 0) {
      const old   = actor.system.health.value;
      const newHp = Math.max(0, old - remaining);
      await actor.update({ 'system.health.value': newHp });
      CWNTargetedAttack._floatText(token, old - newHp, '0xFF0000');

      const defeated = newHp <= 0;
      await token?.combatant?.update({ defeated });
      const status = CONFIG.statusEffects.find(e => e.id === CONFIG.specialStatusEffects.DEFEATED);
      if (status && token?.object) await token.object.toggleEffect(status, { overlay: true, active: defeated });
    }
    
    // Force sheet refresh if open
    if (actor.sheet?.rendered) {
      actor.sheet.render();
    }

    const absorbed = amount - remaining;
    const msg = remaining <= 0
      ? `${actor.name}: ${amount} damage fully absorbed by soak/DR.`
      : absorbed > 0
        ? `${actor.name} takes ${remaining} HP damage (${absorbed} absorbed by soak/DR).`
        : `${actor.name} takes ${remaining} HP damage.`;
    ui.notifications.info(msg);
  }

  // ── NPC direct-roll resolution (called from CWNNpcSheet._onRollAttack) ────

  static async resolveNpcAttack(actor, token, atkLabel, hitTotal, dmgTotal, specialText, atkRoll = null) {
    const ac       = CWNTargetedAttack._getAC(actor);
    const hit      = hitTotal >= ac;
    const delta    = hitTotal - ac;
    const soakInfo = CWNTargetedAttack._getSoakInfo(actor);
    const hp       = { value: actor.system.health?.value ?? 0, max: actor.system.health?.max ?? 0 };

    // Pull formula + native tooltip straight off the Roll object itself
    // (no chat card DOM exists yet for NPC attacks at this point).
    let hitFormula = '', hitTooltipHTML = '';
    if (atkRoll) {
      hitFormula = atkRoll.formula ?? '';
      try {
        const rawTooltip = await atkRoll.getTooltip();
        hitTooltipHTML = rawTooltip.includes('dice-tooltip')
          ? rawTooltip
          : `<div class="dice-tooltip">${rawTooltip}</div>`;
      } catch (e) {
        console.warn('CWN Sheets | Could not build NPC roll tooltip:', e);
      }
    }

    // Trauma die from NPC's primary weapon item if present, else null
    const traumaDie = CWNTargetedAttack._extractTraumaDie(actor, atkLabel);
    let traumaResult = null;
    if (hit && traumaDie) {
      try {
        const tr = await new Roll(traumaDie).evaluate();
        traumaResult = { total: tr.total, formula: traumaDie, roll: tr };
      } catch (e) {
        console.warn('CWN Sheets | NPC trauma die roll failed:', e);
      }
    }

    const content = CWNTargetedAttack._buildResolutionCard({
      attackerName: actor.name,
      weaponName:   atkLabel,
      targetName:   token?.name ?? actor.name,
      targetId:     token?.id ?? '',
      actorId:      actor.id,
      ac, hitTotal, delta, hit,
      dmgTotal: hit ? dmgTotal : null,
      soakInfo, hp, traumaResult,
      hitFormula, hitTooltipHTML,
    });

    const rolls = traumaResult?.roll ? [traumaResult.roll] : [];
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls,
      flags: { [MODULE]: { type: 'resolution', actorId: actor.id, tokenId: token?.id ?? '' } },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  static _getAC(actor) {
    return actor.system.ac ?? actor.system.baseAc ?? 10;
  }

  static _isArmorEquipped(item) {
    // For NPCs, armor may be flagged equipped rather than location=readied.
    // Accept either readied location OR the equipped checkbox being true.
    return item.system.location === 'readied' || item.system.equipped === true || item.system.use === true;
  }

  static _getSoakInfo(actor) {
    let value = 0, max = 0;

    // CWN armor item soak
    if (CWNTargetedAttack._useCWNArmor()) {
      const armors = (actor.items ?? []).filter(i =>
        i.type === 'armor' && CWNTargetedAttack._isArmorEquipped(i) && (i.system.soak?.max ?? 0) > 0
      );
      armors.forEach(a => { value += a.system.soak.value; max += a.system.soak.max; });
    }

    // Module-flag soak (character sheet header tracker)
    const flagSoak = actor.getFlag(MODULE, 'soak');
    if (flagSoak && (flagSoak.max ?? 0) > 0) {
      value += flagSoak.value ?? 0;
      max   += flagSoak.max;
    }

    // NPC base soak
    if (actor.type === 'npc' && (actor.system.baseSoakTotal?.max ?? 0) > 0) {
      value += actor.system.baseSoakTotal.value;
      max   += actor.system.baseSoakTotal.max;
    }

    return max > 0 ? { value, max } : null;
  }

  static _getVehicleArmor(actor) {
    if (actor.type !== 'vehicle') return 0;
    return Number(actor.system.armor ?? 0);
  }

  static _useCWNArmor() {
    try { return game.settings.get('swnr', 'useCWNArmor'); } catch { return false; }
  }

  static _floatText(token, value, color) {
    if (!token || value === 0) return;
    try {
      canvas?.interface?.createScrollingText(
        token.center ?? { x: token.x, y: token.y },
        `${value}`,
        { fontSize: 32, fill: color, stroke: 0x000000, strokeThickness: 4, jitter: 0.25 }
      );
    } catch (_) {}
  }

  static _extractWeaponName(message) {
    try {
      const d = document.createElement('div');
      d.innerHTML = message.content;
      return d.querySelector('h4')?.textContent?.trim() ?? 'Weapon';
    } catch { return 'Weapon'; }
  }

  static async _promptDamage(weaponName) {
    return new Promise(resolve => {
      foundry.applications.api.DialogV2.prompt({
        window:      { title: 'Apply Damage' },
        content:     CWNTargetedAttack._dmgPromptHtml(weaponName),
        modal:       true,
        rejectClose: false,
        ok: {
          label: 'Apply',
          callback: (_e, button) => {
            const v = parseInt(button.form?.querySelector?.('[name="dmg"]')?.value ?? '0');
            resolve(isNaN(v) ? null : v);
          },
        },
      }).catch(() => resolve(null));
    });
  }

  static _dmgPromptHtml(weaponName) {
    return `<div style="font-family:'Share Tech Mono',monospace;padding:8px 0">
      <p style="font-size:11px;letter-spacing:0.1em;color:#9eccd8;margin-bottom:8px;text-transform:uppercase">
        Damage for ${weaponName}
      </p>
      <input type="number" name="dmg" value="0" min="0"
        style="width:100%;background:rgba(0,232,255,0.06);border:1px solid rgba(0,232,255,0.3);
               color:#ceeef8;font-family:inherit;font-size:18px;text-align:center;
               padding:6px;border-radius:2px" />
    </div>`;
  }

  // ── Resolution card HTML builder ──────────────────────────────────────────

  static _buildResolutionCard({
    attackerName, weaponName, targetName, targetId, actorId,
    ac, hitTotal, delta, hit, dmgTotal, soakInfo, hp, traumaResult,
    hitFormula = '', hitTooltipHTML = '',
  }) {
    const hitColor  = hit ? '#00ff88' : '#ff2255';
    const hitLabel  = hit ? 'HIT' : 'MISS';
    const deltaStr  = delta >= 0 ? `+${delta}` : `${delta}`;
    const deltaColor = delta >= 0 ? '#00e8ff' : '#ff2255';

    // Hover-to-reveal dice breakdown for the roll total, reusing the same
    // native-tooltip trick used for skill-check cards. Only rendered when
    // we actually managed to capture a formula/tooltip.
    const hasRollBreakdown = !!hitTooltipHTML;
    const rollBreakdown = hasRollBreakdown
      ? `<div class="cwn-dice-breakdown cwn-rc-roll-breakdown" style="margin:6px 12px">
           <div class="cwn-rc-roll-formula" style="font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:0.08em;margin-bottom:4px">
             ${CWNTargetedAttack._colorFormula(hitFormula)}
           </div>
           ${hitTooltipHTML}
         </div>`
      : '';

    const soakBar = soakInfo
      ? `<div class="cwn-rc-row cwn-rc-soak">
           <span class="cwn-rc-lbl">SOAK</span>
           <div class="cwn-rc-bar-wrap">
             <div class="cwn-rc-bar" style="width:${Math.round((soakInfo.value/soakInfo.max)*100)}%;
               background:#ffa500;box-shadow:0 0 5px #ffa500"></div>
           </div>
           <span class="cwn-rc-val" style="color:#ffa500">${soakInfo.value}/${soakInfo.max}</span>
         </div>`
      : '';

    const hpPct = hp.max > 0 ? Math.round((hp.value / hp.max) * 100) : 0;
    const hpColor = hpPct > 50 ? '#00ff88' : hpPct > 25 ? '#ffd000' : '#ff2255';

    const dmgSection = hit
      ? dmgTotal !== null
        ? `<div class="cwn-rc-dmg-block">
             <div class="cwn-rc-dmg-total" style="color:${hitColor};text-shadow:0 0 10px ${hitColor}44">
               ${dmgTotal} <span style="font-size:10px;color:#3a6672">DMG</span>
             </div>
             <div class="cwn-rc-btn-row">
               ${CWNTargetedAttack._dmgBtn('apply-full',   actorId, targetId, dmgTotal,      '⬤ Full',   '#ff2255', targetId)}
               ${CWNTargetedAttack._dmgBtn('apply-half',   actorId, targetId, dmgTotal,      '◑ Half',   '#ffd000', targetId)}
               ${CWNTargetedAttack._dmgBtn('apply-double', actorId, targetId, dmgTotal,      '⬤⬤ ×2',  '#ff0090', targetId)}
               ${CWNTargetedAttack._dmgBtn('apply-heal',   actorId, targetId, dmgTotal,      '✚ Heal',   '#00ff88', targetId)}
             </div>
           </div>`
        : `<div class="cwn-rc-dmg-block">
             <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.18em;
                         color:#3a6672;text-transform:uppercase;margin-bottom:8px">
               No damage rolled yet
             </div>
             <div class="cwn-rc-btn-row">
               <button class="cwn-rc-btn" data-cwn-action="prompt-damage"
                       data-actor-id="${actorId}" data-token-id="${targetId}"
                       data-weapon-name="${weaponName}"
                       style="border-color:rgba(0,232,255,0.3);color:#00e8ff;flex:1">
                 <i class="fas fa-dice"></i> Enter Damage
               </button>
             </div>
           </div>`
      : `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.2em;
                     color:#3a6672;text-align:center;padding:8px 0;text-transform:uppercase">
           Attack missed — no damage applied
         </div>`;

    // Trauma die block — only shown on a hit with a rolled result
    const traumaSection = traumaResult
      ? `<div class="cwn-rc-trauma">
           <span class="cwn-rc-trauma-label">TRAUMA</span>
           <span class="cwn-rc-trauma-formula">${traumaResult.formula}</span>
           <span class="cwn-rc-trauma-total">${traumaResult.total}</span>
         </div>`
      : '';

    return `<div class="cwn-resolution-card" data-actor-id="${actorId}" data-token-id="${targetId}">
      <div class="cwn-rc-header">
        <div class="cwn-rc-attacker">${attackerName}</div>
        <div class="cwn-rc-weapon">${weaponName}</div>
        <div class="cwn-rc-arrow">▶</div>
        <div class="cwn-rc-target">${targetName}</div>
      </div>

      <div class="cwn-rc-result" style="border-color:${hitColor};box-shadow:0 0 18px ${hitColor}22">
        <div class="cwn-rc-hit-label" style="color:${hitColor};text-shadow:0 0 12px ${hitColor}66">
          ${hitLabel}
        </div>
        <div class="cwn-rc-hit-detail">
          <span style="color:#3a6672">Roll</span>
          <span class="cwn-rc-roll-value${hasRollBreakdown ? ' cwn-total-expandable' : ''}" style="color:#ceeef8;font-weight:700"${hasRollBreakdown ? ' title="Hover to see dice"' : ''}>${hitTotal}</span>
          <span style="color:#3a6672">vs AC</span>
          <span style="color:#ceeef8;font-weight:700">${ac}</span>
          <span style="color:${deltaColor};font-weight:700">(${deltaStr})</span>
        </div>
      </div>
      ${rollBreakdown}

      <div class="cwn-rc-status">
        <div class="cwn-rc-row">
          <span class="cwn-rc-lbl">HP</span>
          <div class="cwn-rc-bar-wrap">
            <div class="cwn-rc-bar" style="width:${hpPct}%;background:${hpColor};box-shadow:0 0 5px ${hpColor}"></div>
          </div>
          <span class="cwn-rc-val" style="color:${hpColor}">${hp.value}/${hp.max}</span>
        </div>
        ${soakBar}
      </div>

      ${dmgSection}
      ${traumaSection}
    </div>`;
  }

  static _dmgBtn(action, actorId, tokenId, dmgTotal, label, color, targetId) {
    return `<button class="cwn-rc-btn" data-cwn-action="${action}"
               data-actor-id="${actorId}" data-token-id="${targetId ?? tokenId}"
               data-damage="${dmgTotal}"
               style="border-color:${color}44;color:${color}">
              ${label}
            </button>`;
  }

  // Colour a dice formula string (e.g. "1d20 + 3 + 2") for display —
  // dice terms in magenta, flat modifiers in cyan, matching the palette
  // already used for skill-check formulas.
  static _colorFormula(formula) {
    if (!formula) return '';
    const parts = String(formula).split(/([+-])/);
    let out = '';
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      if (p.includes('d')) out += `<span style="color:#ff0090;text-shadow:0 0 6px rgba(255,0,144,0.4)">${p}</span>`;
      else if (p === '+' || p === '-') out += ` ${p} `;
      else out += `<span style="color:#00e8ff">${p}</span>`;
    }
    return out;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Hook Registration
// ═══════════════════════════════════════════════════════════════════════════

// In-memory set — tracks message IDs already processed this session.
// Avoids flag write race conditions and double-fires on re-render.
const _resolvedIds = new Set();

export function registerTargetingHooks() {

  // Stamp current targets onto every outgoing attack message at creation time.
  // This runs on the PLAYER's client where game.user.targets is populated.
  // The GM's renderChatMessageHTML hook then reads these stored targets.
  Hooks.on('preCreateChatMessage', (message, data) => {
    // Only stamp if there are targets and this looks like an attack roll
    const targets = [...(game.user?.targets ?? [])];
    if (!targets.length) return;

    // Check if the content contains attack roll markup
    const div = document.createElement('div');
    div.innerHTML = data.content ?? '';
    if (!div.querySelector('.roll-hit')) return;

    // Store tokenId + actorId for each target
    const targetData = targets.map(t => ({
      tokenId: t.id,
      actorId: t.actor?.id ?? null,
      name:    t.name,
    }));

    message.updateSource({
      flags: foundry.utils.mergeObject(data.flags ?? {}, {
        [MODULE]: { targets: targetData },
      }),
    });
  });

  // Detect swnr attack cards and hide them on all clients.
  // The GM also fires resolution to post the custom card.
  Hooks.on('renderChatMessageHTML', (message, html) => {
    const el = html instanceof HTMLElement ? html : html[0];
    if (!el) return;
    const card = el.querySelector('.chat-card.item-card');
    if (!card) return;
    if (!card.querySelector('.roll-hit')) return;

    // Hide the original attack card on every client unconditionally
    el.style.display = 'none';

    // Only GM posts the resolution card — once per message
    if (!game.user.isGM) return;
    if (_resolvedIds.has(message.id)) return;
    _resolvedIds.add(message.id);
    CWNTargetedAttack.resolveVsTargets(message, card);
  });

  // Wire hover-to-reveal dice breakdown on the roll total
  Hooks.on('renderChatMessageHTML', (message, html) => {
    const el = html instanceof HTMLElement ? html : html[0];
    if (!el) return;

    el.querySelectorAll('.cwn-rc-roll-value.cwn-total-expandable').forEach(rollEl => {
      const breakdown = rollEl.closest('.cwn-rc-result')?.nextElementSibling;
      if (!breakdown || !breakdown.classList.contains('cwn-rc-roll-breakdown')) return;
      rollEl.addEventListener('mouseenter', () => breakdown.classList.add('cwn-breakdown-open'));
      rollEl.addEventListener('mouseleave', () => breakdown.classList.remove('cwn-breakdown-open'));
    });
  });

  // Wire action buttons on resolution cards
  Hooks.on('renderChatMessageHTML', (message, html) => {
    const el = html instanceof HTMLElement ? html : html[0];
    if (!el) return;

    el.querySelectorAll('[data-cwn-action]').forEach(btn => {
      btn.addEventListener('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();

        const action  = btn.dataset.cwnAction;
        const actorId = btn.dataset.actorId;
        const tokenId = btn.dataset.tokenId;
        const base    = parseInt(btn.dataset.damage ?? '0');

        const _apply = async (amount) => {
          if (game.user.isGM) {
            await CWNTargetedAttack.applyToActor(actorId, tokenId, amount);
          } else {
            game.socket.emit(`module.${MODULE}`, { type: 'applyDamage', actorId, tokenId, amount });
          }
        };

        switch (action) {
          case 'apply-full':    await _apply(base);                     break;
          case 'apply-half':    await _apply(Math.floor(base / 2));     break;
          case 'apply-double':  await _apply(base * 2);                 break;
          case 'apply-heal':    await _apply(-base);                    break;
          case 'prompt-damage': {
            const dmg = await CWNTargetedAttack._promptDamage(btn.dataset.weaponName ?? 'weapon');
            if (dmg !== null) await _apply(dmg);
            break;
          }
        }
      });
    });
  });
}
