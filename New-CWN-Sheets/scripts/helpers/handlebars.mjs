/**
 * Custom Handlebars helpers for New CWN Sheets.
 * Registered during the 'init' hook.
 */

export function registerHandlebarsHelpers() {
  // ── Math ──────────────────────────────────────────────────────────────────

  /** Return a percentage (0–100) clamped */
  Handlebars.registerHelper('cwnPercent', (value, max) => {
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((Number(value) / Number(max)) * 100)));
  });

  /** Return color for soak bar (green → yellow → red based on percentage) */
  Handlebars.registerHelper('cwnSoakColor', (value, max) => {
    if (!max || max <= 0) return '#00ff88';
    const percent = Math.min(100, Math.max(0, (Number(value) / Number(max)) * 100));
    if (percent >= 75) return '#00ff88'; // Green
    if (percent >= 50) return '#88ff00'; // Yellow-green
    if (percent >= 25) return '#ffaa00'; // Orange
    return '#ff2255'; // Red
  });

  /** Simple add */
  Handlebars.registerHelper('cwnAdd', (a, b) => Number(a) + Number(b));

  /** Positive modifier string (+X or −X) */
  Handlebars.registerHelper('cwnMod', (mod) => {
    const n = Number(mod);
    return n >= 0 ? `+${n}` : `${n}`;
  });

  // ── Types ──────────────────────────────────────────────────────────────────
  Handlebars.registerHelper('array', (...args) => {
    // Last arg is always options object from Handlebars
    return args.slice(0, -1);
  });

  // ── Booleans ───────────────────────────────────────────────────────────────

  Handlebars.registerHelper('cwnEq',  (a, b) => a === b);
  Handlebars.registerHelper('eq',      (a, b) => a === b);   // shorthand used in cyberdeck template
  Handlebars.registerHelper('cwnNeq', (a, b) => a !== b);
  Handlebars.registerHelper('cwnGt',  (a, b) => Number(a) > Number(b));
  Handlebars.registerHelper('cwnLt',  (a, b) => Number(a) < Number(b));
  Handlebars.registerHelper('cwnOr',  (...args) => {
    // last arg is Handlebars options hash
    const vals = args.slice(0, -1);
    return vals.some(Boolean);
  });

  // ── Strings ────────────────────────────────────────────────────────────────

  /** Capitalize first letter */
  Handlebars.registerHelper('cwnCapitalize', str =>
    typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : str
  );

  /** Return icon class for a given item type */
  Handlebars.registerHelper('cwnItemIcon', (type) => {
    const map = {
      weapon:   'fa-crosshairs',
      armor:    'fa-shield-halved',
      item:     'fa-box',
      cyberware:'fa-microchip',
      power:    'fa-bolt',
      feature:  'fa-star-of-life',
      skill:    'fa-graduation-cap',
    };
    return map[type] ?? 'fa-circle';
  });

  /** Brief subtitle for an item (used in favorites bar, etc.) */
  Handlebars.registerHelper('cwnItemSubtitle', (item) => {
    if (!item) return '';
    switch (item.type) {
      case 'weapon':   return item.system?.damage ?? '';
      case 'armor':    return `AC ${item.system?.ac ?? '?'}`;
      case 'cyberware':return item.system?.type ?? '';
      case 'skill':    return `Rank ${item.system?.rank ?? -1}`;
      default:         return item.type;
    }
  });

  // ── UI helpers ─────────────────────────────────────────────────────────────

  /** Return 'active' if value equals the active tab id */
  Handlebars.registerHelper('cwnActiveTab', (id, activeId) =>
    id === activeId ? 'active' : ''
  );

  /** Return 'checked' attribute if truthy */
  Handlebars.registerHelper('cwnChecked', (val) => val ? 'checked' : '');

  /** Return 'selected' attribute if a === b */
  Handlebars.registerHelper('cwnSelected', (a, b) => a === b ? 'selected' : '');

  console.log('[new-cwn-sheets] Handlebars helpers registered');
}
