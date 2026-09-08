/**
 * CWNCyberdeck — cwn-cyberdeck.mjs
 *
 * Shared data and utility layer for the cyberdeck alternate sheet mode.
 * State is persisted to actor flags under New-CWN-Sheets.cyberdeckState
 * (runtime: accessCur, programs array).
 * Long-term setup is saved to New-CWN-Sheets.cyberdeckSetup.
 */

const MODULE_ID = 'New-CWN-Sheets';
const MWN_ID    = 'macros-without-number';

// ── Deck catalogue (mirrors MWN) ───────────────────────────────────────────────
export const DECKS = {
  'Cranial Jack':          { cost: 'As cyber', bonusAccess: 0, memory: 0,  shielding: 0,  cpu: 1, enc: 'N/A', tier: 0, desc: 'Neural implant only. No deck required — programs run directly from wetware.' },
  'Scrap Deck':            { cost: '$500',      bonusAccess: 1, memory: 8,  shielding: 5,  cpu: 2, enc: 1,     tier: 1, desc: 'Cobbled together from salvage and desperation. It works. Usually.' },
  'Yamagata Tanto':        { cost: '$5,000',    bonusAccess: 1, memory: 10, shielding: 10, cpu: 3, enc: 1,     tier: 2, desc: 'Entry-level corp hardware. Clean lines. Reliable firmware. Zero personality.' },
  'Redding Tech Icepick':  { cost: '$15,000',   bonusAccess: 2, memory: 10, shielding: 10, cpu: 3, enc: 1,     tier: 2, desc: 'Built for precision intrusion. The name is not subtle. Neither is the performance.' },
  'Alliance Synapse':      { cost: '$30,000',   bonusAccess: 2, memory: 11, shielding: 5,  cpu: 4, enc: 1,     tier: 3, desc: 'Military surplus. Fast and aggressive. Shielding sacrificed for raw throughput.' },
  'Legau-Durach Beowulf':  { cost: '$60,000',   bonusAccess: 2, memory: 13, shielding: 10, cpu: 4, enc: 1,     tier: 3, desc: 'European black-market tech. Heavy, powerful, and conspicuously illegal in seven jurisdictions.' },
  'Nova Vida Tizona':      { cost: '$100,000',  bonusAccess: 3, memory: 11, shielding: 10, cpu: 5, enc: 1,     tier: 4, desc: 'Corporate espionage standard. Three Access bonus. This is when runs stop being desperate.' },
  'Guang Taifu':           { cost: '$250,000',  bonusAccess: 3, memory: 13, shielding: 15, cpu: 6, enc: 1,     tier: 4, desc: 'The pinnacle. Fifteen shielding, six CPU slots. Runs that were impossible become merely suicidal.' },
};

// ── Verb catalogue ─────────────────────────────────────────────────────────────
export const VERBS = [
  { name: 'Analyze',   cost: 0, desc: 'Free action. Learn one fact about a subject.' },
  { name: 'Blind',     cost: 1, desc: 'Shut down sensory node. Cameras go dark, turrets lose targeting.' },
  { name: 'Command',   cost: 2, desc: 'Issue one order to a node. Requires Memory slot.' },
  { name: 'Deactivate',cost: 1, desc: 'Turn off a device node for one round.' },
  { name: 'Defend',    cost: 0, desc: 'Protect a friendly node from attack. Opposed roll.' },
  { name: 'Glitch',    cost: 1, desc: 'Introduce a malfunction. Node acts erratically.' },
  { name: 'Hijack',    cost: 2, desc: 'Take full control of a node. Requires Memory slot.' },
  { name: 'Kill',      cost: 2, desc: 'Destroy an Avatar or Demon permanently.' },
  { name: 'Mask',      cost: 1, desc: 'Hide your Avatar from detection for 1 round.' },
  { name: 'Navigate',  cost: 0, desc: 'Move to an adjacent connected node. Free action.' },
  { name: 'Sabotage',  cost: 2, desc: 'Destroy a physical device via its node.' },
  { name: 'Sense',     cost: 0, desc: 'Free action. Detect hidden connections or demons.' },
  { name: 'Trace',     cost: 1, desc: 'Learn the physical location of a node or Avatar.' },
  { name: 'Watch',     cost: 0, desc: 'Free action. Monitor node for intrusion attempts for 1 hour.' },
  { name: 'Frisk',     cost: 0, desc: 'Free action. Enumerate all cyberware on a target within wireless range.' },
  { name: 'Attack',    cost: 1, desc: 'Cyberspace combat against Avatar, Demon, or cyberware.' },
];

// ── Subject catalogue ──────────────────────────────────────────────────────────
export const SUBJECTS = [
  { name: 'Avatar',    desc: "Another hacker's cyberspace presence." },
  { name: 'Barrier',   desc: 'A locked connection between nodes.' },
  { name: 'Camera',    desc: 'Surveillance camera node.' },
  { name: 'Comms',     desc: 'Communication channel node.' },
  { name: 'Cyberware', desc: "Target's installed hardware." },
  { name: 'Datafile',  desc: 'A stored file or data object.' },
  { name: 'Demon',     desc: 'An autonomous defense program.' },
  { name: 'Door',      desc: 'A physical door control node.' },
  { name: 'Network',   desc: 'The entire local network.' },
  { name: 'Panel',     desc: 'A security/control panel node.' },
  { name: 'Program',   desc: 'A running program in the node.' },
  { name: 'Turret',    desc: 'An automated weapon system node.' },
];

// ── State helpers ──────────────────────────────────────────────────────────────

/**
 * Return a merged state object from the actor flag, with sane defaults.
 * Runtime state (accessCur) lives here; setup state also lives here.
 */
export function getState(actor) {
  const saved = actor?.getFlag(MODULE_ID, 'cyberdeckState') ?? {};
  return foundry.utils.mergeObject({
    deckName:         'Scrap Deck',
    accessMax:        8,
    accessCur:        8,
    programs:         [],
    expertProgrammer: false,
    expertLevel:      1,
    charLevel:        1,
    programSkill:     0,
    avatarHandle:     '',
    avatarUrl:        '',
    avatarDescription: '',
  }, saved, { inplace: false });
}

/**
 * Persist state back to the actor flag (no DB write delay for runtime tweaks).
 */
export function saveState(actor, state) {
  actor?.setFlag(MODULE_ID, 'cyberdeckState', state);
}

/**
 * Calculate total slot count from state.
 */
export function totalSlots(state) {
  const deck = DECKS[state.deckName] ?? DECKS['Scrap Deck'];
  let cpu = deck.cpu;
  if (state.expertProgrammer && (state.expertLevel ?? 1) >= 2) {
    cpu += (state.programSkill ?? 0);
  }
  const extra = state.expertProgrammer ? (state.charLevel ?? 1) + 2 : 0;
  return cpu + extra;
}

// ── Persistent setup (actor flag) ──────────────────────────────────────────────

const SETUP_FIELDS = [
  'deckName', 'expertProgrammer', 'expertLevel', 'charLevel', 'programSkill',
  'avatarHandle', 'avatarUrl', 'avatarDescription', 'programs',
];

export async function saveToActor(actor, state) {
  const setup = {};
  for (const k of SETUP_FIELDS) setup[k] = state[k];
  await actor.setFlag(MODULE_ID, 'cyberdeckSetup', setup);
}

export async function loadFromActor(actor) {
  return actor?.getFlag(MODULE_ID, 'cyberdeckSetup') ?? null;
}

// ── Roll helper ────────────────────────────────────────────────────────────────

export async function rollProgramCheck(actor, prog) {
  const sys      = actor.system;
  const intVal   = sys?.stats?.int?.value ?? 10;
  const intMod   = sys?.stats?.int?.mod   ?? Math.floor((intVal - 10) / 2);

  let programSkill = 0;
  const progItem = actor.items?.find(i =>
    i.type === 'skill' && (i.name?.toLowerCase().includes('program') || i.name?.toLowerCase().includes('hack'))
  );
  if (progItem) programSkill = progItem.system?.rank ?? 0;

  const verbData = VERBS.find(v => v.name === prog.verb);

  const diff = await _promptDifficulty(actor, prog, intMod, programSkill);
  if (diff === null) return;

  const formula = `2d6 + ${intMod} + ${programSkill}`;
  const roll    = await new Roll(formula).evaluate();
  const success = roll.total >= diff;

  await ChatMessage.create({
    content: _rollCard(prog, roll, intMod, programSkill, diff, success, verbData),
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls:   [roll],
  });
}

async function _promptDifficulty(actor, prog, intMod, programSkill) {
  return new Promise(resolve => {
    new Dialog({
      title: `Roll: ${prog.verb} / ${prog.subject}`,
      content: `
        <div style="font-family:monospace;padding:8px;background:#020509;color:#9eccd8">
          <div style="margin-bottom:8px;font-size:11px;color:#3a6672">
            ${actor.name} · INT ${intMod >= 0 ? '+' : ''}${intMod} · Program ${programSkill}
          </div>
          <label style="font-size:11px">Node Difficulty:
            <input type="number" id="cwn-cd-diff" value="8" min="1" max="20"
              style="width:50px;margin-left:6px;font-family:monospace;background:#06121a;color:#00e8ff;border:1px solid #00e8ff44;padding:2px 4px">
          </label>
          <div style="font-size:10px;color:#3a6672;margin-top:6px">Roll: 2d6 + ${intMod >= 0 ? '+' : ''}${intMod} INT + ${programSkill} Program</div>
        </div>`,
      buttons: {
        roll:   { label: '🎲 Roll',  callback: html => resolve(parseInt((html instanceof HTMLElement ? html : html[0]).querySelector('#cwn-cd-diff')?.value) || 8) },
        cancel: { label: 'Cancel',   callback: () => resolve(null) },
      },
      default: 'roll',
      close:   () => resolve(null),
    }).render(true);
  });
}

function _rollCard(prog, roll, intMod, programSkill, diff, success, verbData) {
  const col = success ? '#00ff88' : '#ff2255';
  return `<div style="background:#020509;border:1px solid ${col};border-radius:3px;padding:8px 12px;font-family:monospace">
    <div style="color:${col};font-size:12px;font-weight:bold;margin-bottom:4px">${success ? '✓' : '✗'} ${prog.verb} / ${prog.subject} — ${success ? 'SUCCESS' : 'FAILURE'}</div>
    <div style="color:#9eccd8;font-size:11px">Roll: <strong>${roll.total}</strong> (2d6+${intMod}+${programSkill}) vs Difficulty ${diff}</div>
    ${verbData?.desc ? `<div style="color:#3a6672;font-size:10px;margin-top:3px;font-style:italic">${verbData.desc}</div>` : ''}
  </div>`;
}

// ── Run program (post to chat, deduct access) ──────────────────────────────────

export async function runProgram(actor, prog, state) {
  const verbData = VERBS.find(v => v.name === prog.verb);
  const cost     = verbData?.cost ?? 0;

  if (cost > 0 && state.accessCur < cost) {
    ui.notifications?.warn(`Not enough Access — need ${cost}, have ${state.accessCur}.`);
    return;
  }
  if (cost > 0) state.accessCur -= cost;

  await ChatMessage.create({
    content: `<div style="background:#020509;border:1px solid #00e8ff44;border-radius:3px;padding:8px 12px;font-family:monospace">
      <div style="color:#00e8ff;font-size:12px;font-weight:bold;margin-bottom:4px">▶ ${prog.verb.toUpperCase()} / ${prog.subject.toUpperCase()}</div>
      <div style="color:#9eccd8;font-size:11px">${verbData?.desc ?? ''}</div>
      ${cost > 0
        ? `<div style="color:#ff8800;font-size:10px;margin-top:4px">Access spent: ${cost} (remaining: ${state.accessCur})</div>`
        : `<div style="color:#00ff88;font-size:10px;margin-top:4px">Free action — no Access cost.</div>`}
      <div style="color:#3a6672;font-size:10px;margin-top:3px">Roll 2d6 + Int mod + Program skill vs node difficulty.</div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}

// Named export object for convenient single-import
export const CWNCyberdeck = {
  DECKS, VERBS, SUBJECTS,
  getState, saveState, totalSlots,
  saveToActor, loadFromActor,
  rollProgramCheck, runProgram,
};
