/**
 * New CWN Sheets — cwn-sheets.mjs
 * Entry point. Registers all CWN actor sheets.
 */

import { CWNCharacterSheet } from './sheets/cwn-character-sheet.mjs';
import { CWNNpcSheet }       from './sheets/cwn-npc-sheet.mjs';
import { CWNVehicleSheet }   from './sheets/cwn-vehicle-sheet.mjs';
import { CWNDroneSheet }     from './sheets/cwn-drone-sheet.mjs';
import {
  CWNWeaponSheet,
  CWNArmorSheet,
  CWNGearSheet,
  CWNSkillSheet,
  CWNFeatureSheet,
  CWNCyberwareSheet,
  CWNPowerSheet,
  CWNProgramSheet,
  CWNAssetSheet,
  CWNShipWeaponSheet,
  CWNShipFittingSheet,
  CWNShipDefenseSheet,
} from './sheets/cwn-item-sheet.mjs';
import { registerHandlebarsHelpers }  from './helpers/handlebars.mjs';
import { registerTargetingHooks, CWNTargetedAttack } from './cwn-targeting.mjs';
import { registerFriskSocket }               from './cwn-frisk.mjs';
import { CWNNpcImporter }                    from './cwn-npc-importer.mjs';

const MODULE_ID = 'New-CWN-Sheets';

// ─── Init ────────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing`);

  registerHandlebarsHelpers();

  // Pre-load shared fragment templates
  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/actor/fragments/item-row.hbs`,
    `modules/${MODULE_ID}/templates/actor/fragments/power-row.hbs`,
    `modules/${MODULE_ID}/templates/actor/fragments/pool-badge.hbs`,
    `modules/${MODULE_ID}/templates/chat/frisk-result.hbs`,
    `modules/${MODULE_ID}/templates/actor/parts/cyberdeck.hbs`,
  ]);

  // ── Register sheets ────────────────────────────────────────────────────────

  const registerSheet = (SheetClass, types, label) => {
    try {
      foundry.documents.collections.Actors.registerSheet(MODULE_ID, SheetClass, {
        types,
        makeDefault: false,
        label,
      });
      console.log(`${MODULE_ID} | Registered: ${label}`);
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to register ${label}:`, err);
    }
  };

  registerSheet(CWNCharacterSheet, ['character'], 'CWN Character Sheet');
  registerSheet(CWNNpcSheet,       ['npc'],       'CWN NPC Sheet');
  registerSheet(CWNVehicleSheet,   ['vehicle'],   'CWN Vehicle Sheet');
  registerSheet(CWNDroneSheet,     ['drone'],     'CWN Drone Sheet');

  // ── Item sheets ────────────────────────────────────────────────────────────

  const registerItemSheet = (SheetClass, types, label) => {
    try {
      foundry.documents.collections.Items.registerSheet(MODULE_ID, SheetClass, {
        types,
        makeDefault: false,
        label,
      });
      console.log(`${MODULE_ID} | Registered: ${label}`);
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to register ${label}:`, err);
    }
  };

  registerItemSheet(CWNWeaponSheet,      ['weapon'],      'CWN Weapon Sheet');
  registerItemSheet(CWNArmorSheet,       ['armor'],       'CWN Armor Sheet');
  registerItemSheet(CWNGearSheet,        ['item'],        'CWN Gear Sheet');
  registerItemSheet(CWNSkillSheet,       ['skill'],       'CWN Skill Sheet');
  registerItemSheet(CWNFeatureSheet,     ['feature'],     'CWN Feature Sheet');
  registerItemSheet(CWNCyberwareSheet,   ['cyberware'],   'CWN Cyberware Sheet');
  registerItemSheet(CWNPowerSheet,       ['power'],       'CWN Power Sheet');
  registerItemSheet(CWNProgramSheet,     ['program'],     'CWN Program Sheet');
  registerItemSheet(CWNAssetSheet,       ['asset'],       'CWN Asset Sheet');
  registerItemSheet(CWNShipWeaponSheet,  ['shipWeapon'],  'CWN Ship Weapon Sheet');
  registerItemSheet(CWNShipFittingSheet, ['shipFitting'], 'CWN Ship Fitting Sheet');
  registerItemSheet(CWNShipDefenseSheet, ['shipDefense'], 'CWN Ship Defense Sheet');

  // ── Register targeting/combat hooks ─────────────────────────────────────
  registerTargetingHooks();

  // NPC Quick Import button (GM only) — registered here, but the
  // isGM check happens inside the render hook since game.user isn't
  // populated yet during init.
  CWNNpcImporter.registerDirectoryButton();

  // Expose API globally for macros / other modules
  globalThis.CWNSheets = {
    CWNTargetedAttack,
    applyDamage:  CWNTargetedAttack.applyToActor.bind(CWNTargetedAttack),
    NpcImporter:  CWNNpcImporter,
  };
});

// ─── Ready ───────────────────────────────────────────────────────────────────

Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | Ready`);

  // Socket must be registered in ready, not init
  registerFriskSocket();

  // Targeting socket — GM listens for player damage requests
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    if (!game.user.isGM) return;
    if (data.type === 'applyDamage') {
      await CWNTargetedAttack.applyToActor(data.actorId, data.tokenId, data.amount);
    }
  });

  // Style skill roll cards while preserving the native dice tooltip
  Hooks.on('renderChatMessageHTML', (message, html) => {
    const el = html instanceof HTMLElement ? html : html[0];
    if (!el) return;

    // Only target plain roll messages, not attack cards
    const diceRoll = el.querySelector('.dice-roll');
    const attackCard = el.querySelector('.chat-card.item-card');
    if (!diceRoll || attackCard) return;
    if (diceRoll.classList.contains('cwn-styled')) return;
    diceRoll.classList.add('cwn-styled');

    // Extract data from the existing roll DOM
    const rollTotal = diceRoll.querySelector('.dice-total')?.textContent?.trim() || '0';
    const rollFormula = diceRoll.querySelector('.dice-formula')?.textContent?.trim() || '';
    const skillName = el.querySelector('.flavor-text')?.textContent?.replace('Skill Check: ', '') || 'Skill Check';
    const actorName = message.speaker?.alias || 'Unknown';

    // Grab the native tooltip (contains individual die results) before we restructure
    const nativeTooltip = diceRoll.querySelector('.dice-tooltip');

    // Parse formula for coloured display
    const parts = rollFormula.split(/([+-])/);
    let coloredFormula = '';
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      if (p.includes('d')) coloredFormula += `<span class="cwn-chat-dice">${p}</span>`;
      else if (p === '+' || p === '-') coloredFormula += ` ${p} `;
      else coloredFormula += `<span class="cwn-chat-modifier">${p}</span>`;
    }

    const totalValue = parseInt(rollTotal);
    let totalClass = 'cwn-chat-roll-total';
    if (totalValue < 7) totalClass += ' low';
    else if (totalValue > 9) totalClass += ' high';

    // Build the styled card, keeping the native tooltip inside it
    const customCard = document.createElement('div');
    customCard.className = 'cwn-chat-card';
    customCard.innerHTML = `
      <div class="cwn-chat-header">
        <span>${actorName}</span>
        <span>▶</span>
        <span class="cwn-chat-skill-name">${skillName}</span>
      </div>
      <div class="cwn-chat-roll-result">
        <span class="cwn-chat-roll-label">${coloredFormula}</span>
        <span class="${totalClass} cwn-total-expandable" title="Click to see dice">${rollTotal} <i class="fas fa-dice" style="font-size:0.65em;opacity:0.6"></i></span>
      </div>
      <div class="cwn-dice-breakdown"></div>
    `;

    // Move the native tooltip into our breakdown container
    const breakdown = customCard.querySelector('.cwn-dice-breakdown');
    if (nativeTooltip) breakdown.appendChild(nativeTooltip);

    // Toggle breakdown on click of the total
    customCard.querySelector('.cwn-total-expandable').addEventListener('click', () => {
      breakdown.classList.toggle('cwn-breakdown-open');
    });

    // Replace the original dice-roll element entirely
    diceRoll.replaceWith(customCard);
  });
});
