/**
 * CWNNpcImporter — cwn-npc-importer.mjs
 *
 * Parses the "Chrome & Shadows" NPC manual entry format and creates
 * a fully-populated SWNR NPC actor with all fields mapped to the
 * correct system schema paths.
 *
 * Usage (macro or console):
 *   CWNSheets.NpcImporter.open();
 */

export class CWNNpcImporter {

  // ── Public entry point ──────────────────────────────────────────────────────

  /**
   * Adds an "Import CWN NPC" button to the Actor Directory sidebar header,
   * so the importer is reachable from the UI (not just via macro/console).
   */
  static registerDirectoryButton() {
    Hooks.on('renderActorDirectory', (app, html) => {
      if (!game.user?.isGM) return;

      const el = html instanceof HTMLElement ? html : html[0];
      if (!el) return;
      if (el.querySelector('.cwn-npc-import-btn')) return;

      const header = el.querySelector('.directory-header .action-buttons')
        || el.querySelector('.directory-header');
      if (!header) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cwn-npc-import-btn';
      btn.innerHTML = '<i class="fas fa-user-ninja"></i> Import CWN NPC';
      btn.addEventListener('click', () => CWNNpcImporter.open());
      header.appendChild(btn);
    });
  }

  static open() {
    const content = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;gap:4px;border-bottom:1px solid #3a3a5c;margin-bottom:2px;">
          <button type="button" id="cwn-tab-browse" style="flex:1;padding:6px 10px;background:#22224a;border:none;border-bottom:2px solid #6a6aac;color:#e0e0ff;cursor:pointer;font-size:12px;border-radius:4px 4px 0 0;">Browse Manual</button>
          <button type="button" id="cwn-tab-paste" style="flex:1;padding:6px 10px;background:transparent;border:none;border-bottom:2px solid transparent;color:#8888b0;cursor:pointer;font-size:12px;border-radius:4px 4px 0 0;">Paste Custom</button>
        </div>

        <div id="cwn-panel-browse" style="display:flex;flex-direction:column;gap:8px;">
          <input type="text" id="cwn-npc-search"
                 placeholder="Search Chrome &amp; Shadows by name or type…"
                 style="width:100%;box-sizing:border-box;padding:7px 10px;font-size:12px;background:#12121e;color:#d0d0e8;border:1px solid #3a3a5c;border-radius:6px;" />
          <div id="cwn-npc-list"
               style="height:180px;max-height:180px;overflow-y:scroll;border:1px solid #2a2a4a;border-radius:6px;background:#0c0c1a;">
            <p style="padding:12px;font-size:12px;opacity:0.6;text-align:center;margin:0;">Loading manual…</p>
          </div>
        </div>

        <div id="cwn-panel-paste" style="display:none;flex-direction:column;gap:8px;">
          <p style="margin:0;font-size:12px;opacity:0.75;">Paste a complete NPC entry in the same format, then click <strong>Parse</strong> to preview before importing.</p>
          <textarea id="cwn-npc-paste"
            style="width:100%;height:140px;resize:vertical;font-family:monospace;font-size:11px;line-height:1.5;background:#12121e;color:#d0d0e8;border:1px solid #3a3a5c;border-radius:6px;padding:10px;box-sizing:border-box;"
            placeholder="## 001 — GUTTER PUNK&#10;**Gang Footsoldier**&#10;&#10;*HD* 1 | *AC* 12 | *Atk* +1 | *Dmg* 1d6 (knife) | *Move* 30 | *ML* 7 | *Save* 15&#10;&#10;**Skills:** Sneak +1, Notice +1&#10;**Foci:** Assassin 1&#10;**Gear:** Knife, street clothes&#10;&#10;**Tactics:** Fights dirty...&#10;&#10;*Flavor text here.*"></textarea>
          <div>
            <button type="button" id="cwn-parse-btn"
              style="padding:5px 14px;border-radius:4px;border:1px solid #4a4a7c;background:#1e1e3c;color:#c0c0e8;cursor:pointer;font-size:12px;">
              <i class="fas fa-search"></i> Parse
            </button>
          </div>
        </div>

        <div id="cwn-npc-preview"
             style="display:none;flex-direction:column;gap:4px;background:#0c0c1a;border:1px solid #2a2a4a;border-radius:6px;padding:10px;font-size:12px;max-height:160px;overflow-y:auto;"></div>
      </div>
    `;

    // Shared mutable state read by the OK callback — set by whichever tab
    // (browse list click, or paste Parse click) last produced a valid entry.
    const state = { rawText: null };

    foundry.applications.api.DialogV2.prompt({
      window: { title: 'CWN — NPC Quick Import', icon: 'fas fa-user-ninja' },
      position: { width: 460, height: 'auto' },
      content,
      modal: false,
      rejectClose: false,
      ok: {
        label: '<i class="fas fa-file-import"></i> Import NPC',
        callback: async () => {
          if (!state.rawText) {
            ui.notifications.warn('CWN Importer | Pick an NPC from the list, or paste and parse a custom entry first.');
            return;
          }
          const parsed = CWNNpcImporter._parse(state.rawText);
          if (!parsed.name) {
            ui.notifications.error('CWN Importer | Could not find an NPC name. Check the format.');
            return;
          }
          await CWNNpcImporter._createActor(parsed);
        },
      },
      render: (event, dialog) => {
        const root = dialog.element;

        // ── Tab switching (inline-style driven, no external CSS dependency) ──
        const tabBrowse   = root.querySelector('#cwn-tab-browse');
        const tabPaste     = root.querySelector('#cwn-tab-paste');
        const panelBrowse = root.querySelector('#cwn-panel-browse');
        const panelPaste   = root.querySelector('#cwn-panel-paste');

        const activateTab = (which) => {
          const browseActive = which === 'browse';
          tabBrowse.style.background = browseActive ? '#22224a' : 'transparent';
          tabBrowse.style.color = browseActive ? '#e0e0ff' : '#8888b0';
          tabBrowse.style.borderBottomColor = browseActive ? '#6a6aac' : 'transparent';
          tabPaste.style.background = browseActive ? 'transparent' : '#22224a';
          tabPaste.style.color = browseActive ? '#8888b0' : '#e0e0ff';
          tabPaste.style.borderBottomColor = browseActive ? 'transparent' : '#6a6aac';
          panelBrowse.style.display = browseActive ? 'flex' : 'none';
          panelPaste.style.display = browseActive ? 'none' : 'flex';
        };
        tabBrowse.addEventListener('click', () => activateTab('browse'));
        tabPaste.addEventListener('click', () => activateTab('paste'));

        // ── Browse list ─────────────────────────────────────────────────────
        const listEl    = root.querySelector('#cwn-npc-list');
        const searchEl  = root.querySelector('#cwn-npc-search');
        const previewEl = root.querySelector('#cwn-npc-preview');

        const showPreview = (parsed) => {
          previewEl.innerHTML = CWNNpcImporter._buildPreviewHTML(parsed);
          previewEl.style.display = 'flex';
        };

        const renderList = (entries, filter = '') => {
          const f = filter.trim().toLowerCase();
          const filtered = f
            ? entries.filter(e => e.name.toLowerCase().includes(f) || e.subtitle.toLowerCase().includes(f))
            : entries;

          if (!filtered.length) {
            listEl.innerHTML = `<p style="padding:12px;font-size:12px;opacity:0.6;text-align:center;margin:0;">No matches.</p>`;
            return;
          }

          listEl.innerHTML = '';
          filtered.forEach(entry => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;flex-direction:column;padding:6px 10px;cursor:pointer;border-bottom:1px solid #1c1c34;';
            row.innerHTML = `
              <span style="font-size:12px;color:#e0e0ff;font-weight:bold;">${entry.name}</span>
              ${entry.subtitle ? `<span style="font-size:11px;color:#8888b0;">${entry.subtitle}</span>` : ''}
            `;
            row.addEventListener('click', () => {
              listEl.querySelectorAll('div').forEach(r => r.style.background = '');
              row.style.background = '#22224a';
              state.rawText = entry.raw;
              showPreview(CWNNpcImporter._parse(entry.raw));
            });
            listEl.appendChild(row);
          });
        };

        CWNNpcImporter._loadManualEntries().then(entries => {
          if (!entries.length) {
            listEl.innerHTML = `<p style="padding:12px;font-size:12px;opacity:0.6;text-align:center;margin:0;">Could not load the bundled manual. Use the Paste Custom tab instead.</p>`;
            return;
          }
          renderList(entries);
          searchEl.addEventListener('input', () => renderList(entries, searchEl.value));
        });

        // ── Paste tab ────────────────────────────────────────────────────────────
        const parseBtn = root.querySelector('#cwn-parse-btn');
        if (parseBtn) {
          parseBtn.addEventListener('click', () => {
            const text = root.querySelector('#cwn-npc-paste')?.value?.trim() ?? '';
            if (!text) { previewEl.style.display = 'none'; return; }
            state.rawText = text;
            showPreview(CWNNpcImporter._parse(text));
            listEl.querySelectorAll('div').forEach(r => r.style.background = '');
          });
        }
      },
    });
  }

  // ── Bundled manual loading ──────────────────────────────────────────

  static #manualEntriesCache = null;

  /**
   * Fetch and parse the bundled Chrome & Shadows manual into a flat list of
   * { name, subtitle, raw } entries, cached after the first load.
   */
  static async _loadManualEntries() {
    if (CWNNpcImporter.#manualEntriesCache) return CWNNpcImporter.#manualEntriesCache;
    try {
      const res = await fetch('modules/New-CWN-Sheets/npc%20manual/cwn_npc_manual.md');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const entries = CWNNpcImporter._splitManualEntries(text);
      CWNNpcImporter.#manualEntriesCache = entries;
      return entries;
    } catch (err) {
      console.warn('CWN Importer | Could not load bundled NPC manual:', err);
      return [];
    }
  }

  /**
   * Split the manual's raw markdown into individual NPC entry chunks,
   * filtering out section headers, the intro, and the appendix tables.
   */
  static _splitManualEntries(text) {
    const chunks = text.split(/\n\s*-{3,}\s*\n/);
    const entries = [];
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!/^##\s*\d+/m.test(trimmed)) continue;
      if (!/\*HD\*/.test(trimmed)) continue;
      const parsed = CWNNpcImporter._parse(trimmed);
      if (!parsed.name) continue;
      entries.push({ name: parsed.name, subtitle: parsed.subtitle, raw: trimmed });
    }
    return entries;
  }

  // ── Parser ──────────────────────────────────────────────────────────────────

  /**
   * Parse a raw NPC manual entry string into a structured data object.
   * @param {string} text
   * @returns {object}
   */
  static _parse(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const result = {
      name: '', subtitle: '', faction: '',
      hd: 1, hitDice: '1d8', hpMax: 5,
      ac: 10, ab: 0, damage: 'd6', bonusDamage: 0, damageRaw: '',
      speed: 30, moralScore: 6, saves: 15,
      skills: [], skillsRaw: '',
      foci: [],   fociRaw: '',
      gear: '', gearList: [], tactics: '', flavor: '',
    };

    // ── Name from: ## NNN — NPC NAME ──────────────────────────────────────────
    const nameLine = lines.find(l => /^##\s/.test(l));
    if (nameLine) {
      result.name = nameLine
        .replace(/^##\s*/, '')
        .replace(/^\d+\s*[—–\-]+\s*/, '')
        .trim();
    }

    // ── Subtitle from the first **Bold** line that isn't a stat keyword ───────
    const subtitleLine = lines.find(l =>
      /^\*\*[^*]+\*\*$/.test(l) &&
      !/^\*\*(Skills|Foci|Gear|Tactics):/i.test(l)
    );
    if (subtitleLine) {
      result.subtitle = subtitleLine.replace(/\*\*/g, '').trim();
      result.faction   = result.subtitle;
    }

    // ── Stat line: *HD* N | *AC* N | *Atk* +N | *Dmg* Xd8+N | *Move* N | *ML* N | *Save* N ──
    const statLine = lines.find(l => /\*HD\*/i.test(l) && /\*AC\*/i.test(l));
    if (statLine) {
      const hd  = statLine.match(/\*HD\*\s*([\w]+)/i);
      const ac  = statLine.match(/\*AC\*\s*(\d+)/i);
      const atk = statLine.match(/\*Atk\*\s*([+\-]?\d+)/i);
      const dmg = statLine.match(/\*Dmg\*\s*([^|]+)/i);
      const mv  = statLine.match(/\*Move\*\s*(\d+)/i);
      const ml  = statLine.match(/\*ML\*\s*(\d+)/i);
      const sv  = statLine.match(/\*Save\*\s*(\d+)/i);

      if (hd)  { result.hd = parseInt(hd[1]) || 1; }
      if (ac)  { result.ac = parseInt(ac[1]); }
      if (atk) { result.ab = parseInt(atk[1]); }
      if (mv)  { result.speed = parseInt(mv[1]); }
      if (ml)  { result.moralScore = parseInt(ml[1]); }
      if (sv)  { result.saves = parseInt(sv[1]); }

      if (dmg) {
        const rawDmg = dmg[1].trim();
        result.damageRaw = rawDmg;
        // Take the first expression before " or ", strip parentheticals
        const firstExpr = rawDmg
          .split(/\s+or\s+/i)[0]
          .replace(/\(.*?\)/g, '')
          .trim();
        const dmgMatch = firstExpr.match(/(\d*d\d+)\s*([+\-]\s*\d+)?/i);
        if (dmgMatch) {
          result.damage = dmgMatch[1];
          if (dmgMatch[2]) {
            result.bonusDamage = parseInt(dmgMatch[2].replace(/\s/g, ''));
          }
        } else {
          result.damage = firstExpr.replace(/,/g, '') || 'd6';
        }
      }

      result.hitDice = `${result.hd}d8`;
      // Average d8 = 4.5; round to nearest int; minimum 1
      result.hpMax   = Math.max(1, Math.round(result.hd * 4.5));
    }

    // ── Skills: **Skills:** Name +N, Name +N ──────────────────────────────────
    const skillLine = lines.find(l => /^\*\*Skills:\*\*/i.test(l));
    if (skillLine) {
      result.skillsRaw = skillLine.replace(/^\*\*Skills:\*\*/i, '').trim();
      result.skills = result.skillsRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => {
          const m = s.match(/^(.+?)\s*([+\-]\d+)$/);
          if (m) return { name: m[1].trim(), rank: parseInt(m[2]) };
          return { name: s, rank: 0 };
        });
    }

    // ── Foci: **Foci:** Name N, Name N (level may be 1/2/3) ──────────────────
    const fociLine = lines.find(l => /^\*\*Foci:\*\*/i.test(l));
    if (fociLine) {
      result.fociRaw = fociLine.replace(/^\*\*Foci:\*\*/i, '').trim();
      result.foci    = CWNNpcImporter._parseFoci(result.fociRaw);
    }

    // ── Gear ──────────────────────────────────────────────────────────────────
    const gearLine = lines.find(l => /^\*\*Gear:\*\*/i.test(l));
    if (gearLine) {
      result.gear = gearLine.replace(/^\*\*Gear:\*\*/i, '').trim();
      result.gearList = CWNNpcImporter._splitOnCommas(result.gear)
        .map(g => g.trim())
        .filter(Boolean);
    }

    // ── Tactics ───────────────────────────────────────────────────────────────
    const tacIdx = lines.findIndex(l => /^\*\*Tactics:\*\*/i.test(l));
    if (tacIdx !== -1) {
      result.tactics = lines[tacIdx].replace(/^\*\*Tactics:\*\*/i, '').trim();
    }

    // ── Flavor: italic paragraph (*...*) that isn't a stat line ──────────────
    const flavorLine = lines.find(l =>
      /^\*[^*]/.test(l) && l.endsWith('*') &&
      !/\*HD\*/i.test(l) && !/\*AC\*/i.test(l)
    );
    if (flavorLine) {
      result.flavor = flavorLine.replace(/^\*|\*$/g, '').trim();
    }

    // ── Biography HTML ────────────────────────────────────────────────────────
    result.biography = CWNNpcImporter._buildBiography(result);

    return result;
  }

  /**
   * Split a string on commas that are NOT inside parentheses, e.g.
   *   "Knife, street clothes, stim pack (1 use)"
   * -> ["Knife", "street clothes", "stim pack (1 use)"]
   */
  static _splitOnCommas(raw) {
    const parts = [];
    let depth = 0, current = '';
    for (const ch of raw) {
      if (ch === '(') { depth++; current += ch; }
      else if (ch === ')') { depth--; current += ch; }
      else if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  static _parseFoci(raw) {
    // Split on commas that are NOT inside parentheses
    // (Foci uses "Name N" / "Name N (note)" formatting.)
    const parts = CWNNpcImporter._splitOnCommas(raw);

    return parts
      .filter(Boolean)
      .map(p => {
        // Match "Focus Name 2" or "Focus Name 2 (note)"
        const m = p.match(/^(.+?)\s+(\d+)(\s*\(.*\))?$/);
        if (m) return { name: m[1].trim(), level: parseInt(m[2]) };
        return { name: p, level: 1 };
      });
  }

  /**
   * Build a formatted biography HTML string from parsed data.
   */
  static _buildBiography(d) {
    const parts = [];
    if (d.subtitle)   parts.push(`<p><strong>Type:</strong> ${d.subtitle}</p>`);
    if (d.skillsRaw)  parts.push(`<p><strong>Skills:</strong> ${d.skillsRaw}</p>`);
    if (d.fociRaw)    parts.push(`<p><strong>Foci:</strong> ${d.fociRaw}</p>`);
    if (d.gear)       parts.push(`<p><strong>Gear:</strong> ${d.gear}</p>`);
    if (d.tactics)    parts.push(`<p><strong>Tactics:</strong> ${d.tactics}</p>`);
    if (d.flavor)     parts.push(`<p><em>${d.flavor}</em></p>`);
    return parts.join('\n');
  }

  // ── Actor Creation ──────────────────────────────────────────────────────────

  /**
   * Create a SWNR NPC actor from parsed data, including embedded items.
   * @param {object} d - Parsed data from _parse()
   */
  static async _createActor(d) {
    ui.notifications.info(`CWN Importer | Creating "${d.name}"…`);

    // ── Build actor document data ─────────────────────────────────────────────
    const actorData = {
      name: d.name,
      type: 'npc',
      system: {
        // HP
        health: { value: d.hpMax, max: d.hpMax },
        // AC (base-actor uses baseAc)
        baseAc: parseInt(d.ac) || 10,
        // Attack bonus
        ab: parseInt(d.ab) || 0,
        // Attack block
        attacks: {
          damage:      (d.damage || 'd6').replace(/,/g, ''),
          bonusDamage: parseInt(d.bonusDamage) || 0,
          number:      1,
          name:        d.damageRaw || '',
        },
        // Movement
        speed: parseInt(d.speed) || 30,
        // Save (single number for all three in SWNR)
        saves: parseInt(d.saves) || 15,
        // Morale
        moralScore: parseInt(d.moralScore) || 6,
        // Hit Dice string (e.g. "2d8")
        hitDice: d.hitDice,
        // Faction / NPC type (closest schema field)
        faction: d.faction,
        // Biography
        biography: d.biography,
      },
    };

    // ── Create the actor ──────────────────────────────────────────────────────
    let actor;
    try {
      actor = await Actor.create(actorData);
    } catch (err) {
      ui.notifications.error(`CWN Importer | Failed to create actor: ${err.message}`);
      console.error('CWN Importer | Actor creation error:', err);
      return;
    }

    if (!actor) {
      ui.notifications.error('CWN Importer | Actor creation returned null.');
      return;
    }

    // ── Save/Morale/Skill-bonus ── the NPC sheet reads these from a flag, NOT
    // from system.saves ─ writing only actor system data left the sheet
    // showing the default (10) regardless of what was imported.
    await actor.setFlag('New-CWN-Sheets', 'combatInfo', {
      saves:      parseInt(d.saves) || 10,
      moralScore: parseInt(d.moralScore) || 7,
      skillBonus: 0,
    });

    // ── Auto-create a readied weapon item from the parsed attack/damage ──
    const dmgFormula = d.bonusDamage
      ? `${d.damage}${d.bonusDamage >= 0 ? '+' : ''}${d.bonusDamage}`
      : (d.damage || 'd6');
    try {
      await actor.createEmbeddedDocuments('Item', [{
        name: d.damageRaw ? `${d.name} Attack` : 'Attack',
        type: 'weapon',
        system: {
          damage:   dmgFormula.replace(/,/g, ''),
          ab:       parseInt(d.ab) || 0,
          location: 'readied',
        },
      }]);
    } catch (err) {
      console.warn('CWN Importer | Could not create weapon item:', err);
    }

    // ── Create embedded Skill items ───────────────────────────────────────────
    if (d.skills.length > 0) {
      const skillItems = [];
      for (const s of d.skills) {
        let foundItem = game.items.find(i => i.name.toLowerCase() === s.name.toLowerCase());
        
        // Search compendiums if not found in world
        if (!foundItem) {
          for (const pack of game.packs) {
            if (pack.metadata.type !== "Item") continue;
            await pack.getIndex();
            const entry = pack.index.find(e => e.name.toLowerCase() === s.name.toLowerCase());
            if (entry) {
              foundItem = await pack.getDocument(entry._id);
              break;
            }
          }
        }

        if (foundItem) {
          console.log(`CWN Importer | Found existing skill: ${foundItem.name}`);
          const itemObj = foundItem.toObject();
          itemObj.system.rank = parseInt(s.rank) || 0;
          skillItems.push(itemObj);
        } else {
          skillItems.push({
            name: s.name,
            type: 'skill',
            system: { rank: parseInt(s.rank) || 0 },
          });
        }
      }
      try {
        await actor.createEmbeddedDocuments('Item', skillItems);
      } catch (err) {
        console.warn('CWN Importer | Could not create skill items:', err);
      }
    }

    // ── Create embedded Feature items (Foci) ──────────────────────────────────
    if (d.foci.length > 0) {
      const focusItems = [];
      for (const f of d.foci) {
        let foundItem = game.items.find(i => i.name.toLowerCase() === f.name.toLowerCase());

        // Search compendiums if not found in world
        if (!foundItem) {
          for (const pack of game.packs) {
            if (pack.metadata.type !== "Item") continue;
            await pack.getIndex();
            const entry = pack.index.find(e => e.name.toLowerCase() === f.name.toLowerCase());
            if (entry) {
              foundItem = await pack.getDocument(entry._id);
              break;
            }
          }
        }

        if (foundItem) {
          console.log(`CWN Importer | Found existing focus: ${foundItem.name}`);
          const itemObj = foundItem.toObject();
          itemObj.system.level = parseInt(f.level) || 1;
          focusItems.push(itemObj);
        } else {
          focusItems.push({
            name: f.name,
            type: 'feature',
            system: {
              level: parseInt(f.level) || 1,
              type:  'focus',
            },
          });
        }
      }
      try {
        await actor.createEmbeddedDocuments('Item', focusItems);
      } catch (err) {
        console.warn('CWN Importer | Could not create focus items:', err);
      }
    }

    // ── Create embedded Gear items ─────────────────────────────────
    if (d.gearList?.length > 0) {
      const gearItems = d.gearList.map(name => ({
        name,
        type: 'item',
        system: { uses: { consumable: 'none' } },
      }));
      try {
        await actor.createEmbeddedDocuments('Item', gearItems);
      } catch (err) {
        console.warn('CWN Importer | Could not create gear items:', err);
      }
    }

    // ── Open the sheet ────────────────────────────────────────────────────────
    actor.sheet.render(true);
    ui.notifications.info(`CWN Importer | "${d.name}" imported successfully!`);
  }

  // ── Preview HTML ────────────────────────────────────────────────────────────

  static _buildPreviewHTML(d) {
    if (!d.name) {
      return `<span class="cwn-preview-error">⚠ Could not parse a name. Check that the entry starts with <code>## NNN — NAME</code>.</span>`;
    }

    const row = (label, val, cls = '') =>
      `<div class="cwn-preview-row"><span class="cwn-preview-label">${label}</span><span class="cwn-preview-val ${cls}">${val}</span></div>`;

    const dmgDisplay = d.bonusDamage
      ? `${d.damage}${d.bonusDamage >= 0 ? '+' : ''}${d.bonusDamage}`
      : d.damage;

    const skillList = d.skills.map(s => `${s.name} +${s.rank}`).join(', ') || '—';
    const fociList  = d.foci.map(f => `${f.name} ${f.level}`).join(', ') || '—';

    return [
      `<strong style="color:#a0a0e8">${d.name}</strong>` + (d.subtitle ? ` <span style="opacity:0.6;font-size:11px">(${d.subtitle})</span>` : ''),
      row('HP',      `${d.hpMax} (avg ${d.hitDice})`),
      row('AC',      d.ac),
      row('Attack',  `+${d.ab}`),
      row('Damage',  dmgDisplay),
      row('Speed',   `${d.speed} ft`),
      row('Morale',  d.moralScore),
      row('Save',    d.saves),
      row('Skills',  skillList,  'cwn-preview-skills'),
      row('Foci',    fociList,   'cwn-preview-foci'),
      d.gear    ? row('Gear',    d.gear.substring(0, 80) + (d.gear.length > 80 ? '…' : '')) : '',
      `<div class="cwn-preview-hint">Skills &amp; Foci will be created as embedded items AND written to biography.</div>`,
    ].filter(Boolean).join('');
  }
}
