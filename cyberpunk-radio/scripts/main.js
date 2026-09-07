/**
 * Cyberpunk Radio — Foundry VTT Module v1.0.6
 *
 * Player interaction fix:
 *  Root cause: game.socket.emit() in Foundry v13 requires the SECOND argument
 *  to be a plain object. Our messages were correct, but the socket listener on
 *  the GM was calling handleSocketRequest for EVERY message including ones that
 *  aren't player requests (e.g. if syncState was emitted). More critically,
 *  Foundry v13 sockets require the module socket to be declared in module.json
 *  under "socket": true — without this the socket.on handler never fires on
 *  other clients. Added that, and added a `type` discriminator to all messages.
 *
 *  Additional fixes in this version:
 *  - _readFormChannels: scope colour class lookups to each channel element
 *  - renderPlayerList: always show button (visibility is fine for players)
 *  - Socket handler: only process messages with type === 'playerRequest'
 */

const MODULE_ID = 'cyberpunk-radio';

/* ═══════════════════════════════════════════════════════
   RADIO STATE
═══════════════════════════════════════════════════════ */
class RadioState {
  static getChannels()            { return game.settings.get(MODULE_ID, 'channels') ?? []; }
  static getCurrentChannelIndex() { return game.settings.get(MODULE_ID, 'currentChannel') ?? 0; }
  static getCurrentChannel() {
    const ch = this.getChannels();
    return ch[this.getCurrentChannelIndex()] ?? null;
  }
  static getCurrentPlaylist() {
    const ch = this.getCurrentChannel();
    if (!ch?.playlistId) return null;
    return game.playlists.get(ch.playlistId) ?? null;
  }
  static getNowPlaying() {
    const pl = this.getCurrentPlaylist();
    if (!pl) return null;
    return pl.sounds.find(s => s.playing) ?? pl.sounds.contents[0] ?? null;
  }

  /**
   * Non-GM players cannot write world settings — they emit a socket request
   * to whichever GM client is active. The GM executes the action; Foundry's
   * built-in world-settings sync then propagates the new values to all clients
   * automatically, triggering onChange → re-render everywhere.
   *
   * Message shape: { type: 'playerRequest', action: string, ...payload }
   */
  static _requestGM(action, payload = {}) {
    game.socket.emit(`module.${MODULE_ID}`, {
      type: 'playerRequest',
      action,
      userId: game.user.id,
      ...payload,
    });
  }

  static async switchChannel(index) {
    if (!game.user.isGM) {
      this._requestGM('switchChannel', { index });
      return;
    }
    const channels = this.getChannels();
    if (index < 0 || index >= channels.length) return;
    const cur = this.getCurrentPlaylist();
    if (cur?.playing) await cur.stopAll();
    await game.settings.set(MODULE_ID, 'currentChannel', index);
    await game.settings.set(MODULE_ID, 'isPlaying', false);
  }

  static async togglePlay() {
    if (!game.user.isGM) {
      if (!game.settings.get(MODULE_ID, 'allowPlayerControl')) return;
      this._requestGM('togglePlay');
      return;
    }
    const pl = this.getCurrentPlaylist();
    if (!pl) return;
    const playing = game.settings.get(MODULE_ID, 'isPlaying');
    if (playing) {
      await pl.stopAll();
      await game.settings.set(MODULE_ID, 'isPlaying', false);
    } else {
      await pl.playAll();
      await game.settings.set(MODULE_ID, 'isPlaying', true);
    }
  }

  static async nextTrack() {
    if (!game.user.isGM) {
      if (!game.settings.get(MODULE_ID, 'allowPlayerControl')) return;
      this._requestGM('nextTrack');
      return;
    }
    const pl = this.getCurrentPlaylist();
    if (!pl) return;
    const sounds = pl.sounds.contents;
    const cur  = sounds.findIndex(s => s.playing);
    const next = (cur + 1) % sounds.length;
    if (sounds[next]) {
      if (cur >= 0) await pl.stopSound(sounds[cur]);
      await pl.playSound(sounds[next]);
    }
  }

  static async prevTrack() {
    if (!game.user.isGM) {
      if (!game.settings.get(MODULE_ID, 'allowPlayerControl')) return;
      this._requestGM('prevTrack');
      return;
    }
    const pl = this.getCurrentPlaylist();
    if (!pl) return;
    const sounds = pl.sounds.contents;
    const cur  = sounds.findIndex(s => s.playing);
    const prev = (cur - 1 + sounds.length) % sounds.length;
    if (sounds[prev]) {
      if (cur >= 0) await pl.stopSound(sounds[cur]);
      await pl.playSound(sounds[prev]);
    }
  }

  static async setVolume(volume) {
    if (!game.user.isGM) {
      if (!game.settings.get(MODULE_ID, 'allowPlayerControl')) return;
      this._requestGM('setVolume', { volume });
      return;
    }
    const pl = this.getCurrentPlaylist();
    if (pl?.sounds.size > 0) {
      const updates = pl.sounds.map(s => ({ _id: s.id, volume }));
      await pl.updateEmbeddedDocuments('PlaylistSound', updates);
    }
    await game.settings.set(MODULE_ID, 'volume', volume);
  }

  /** Called on the GM when a player socket request arrives */
  static async handlePlayerRequest(data) {
    if (!game.user.isGM) return;
    switch (data.action) {
      case 'switchChannel': await this.switchChannel(data.index);  break;
      case 'togglePlay':    await this.togglePlay();               break;
      case 'nextTrack':     await this.nextTrack();                break;
      case 'prevTrack':     await this.prevTrack();                break;
      case 'setVolume':     await this.setVolume(data.volume);     break;
      default: console.warn(`Cyberpunk Radio | Unknown action: ${data.action}`);
    }
  }
}

/* ═══════════════════════════════════════════════════════
   CONFIG APPLICATION (GM only)
═══════════════════════════════════════════════════════ */
class CyberpunkRadioConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: 'cyberpunk-radio-config',
    classes: ['cyberpunk-radio-config'],
    tag: 'div',
    window: { title: 'CPRADIO.Config.Title', icon: 'fas fa-sliders-h', resizable: true, minimizable: false },
    position: { width: 660, height: 720 },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/radio-config.hbs` }
  };

  async _prepareContext(options) {
    const context   = await super._prepareContext(options);
    const saved     = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'channels') ?? []);
    const playlists = game.playlists.contents.map(p => ({ id: p.id, name: p.name }));
    const channels  = saved.map(ch => ({
      ...ch,
      playlistOptions: playlists.map(p => ({
        id: p.id, name: p.name, selected: p.id === ch.playlistId,
      }))
    }));
    return { ...context, channels, playlists };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;

    // Colour picker ↔ text input sync, scoped to each channel block
    for (const chEl of el.querySelectorAll('.cp-config-channel')) {
      this._wireColour(chEl, '.cp-picker-bg',    '.cp-text-bg');
      this._wireColour(chEl, '.cp-picker-accent', '.cp-text-accent');
    }

    // Remove buttons
    for (const btn of el.querySelectorAll('[data-cp-action="removeChannel"]')) {
      btn.addEventListener('click', async () => {
        const index = parseInt(btn.dataset.index);
        const channels = this._readFormChannels();
        const name = channels[index]?.name || `Channel ${index}`;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: 'CPRADIO.Config.RemoveTitle' },
          content: `<p>Remove <strong>${name}</strong>? This cannot be undone.</p>`,
          rejectClose: false,
          modal: true,
        });
        if (!confirmed) return;
        channels.splice(index, 1);
        await game.settings.set(MODULE_ID, 'channels', channels);
        this.render();
      });
    }

    // Add channel
    el.querySelector('[data-cp-action="addChannel"]')
      ?.addEventListener('click', async () => {
        const channels = this._readFormChannels();
        channels.push({
          name: `Channel ${channels.length + 1}`,
          freq: (88.1 + channels.length * 1.3).toFixed(1),
          playlistId: '', tagline: '', description: '',
          bgColor: '#050810', accentColor: '#00f5ff', bgImage: '', logo: '📻',
        });
        await game.settings.set(MODULE_ID, 'channels', channels);
        this.render();
      });

    // Save
    el.querySelector('[data-cp-action="saveChannels"]')
      ?.addEventListener('click', async () => {
        const channels = this._readFormChannels();
        await game.settings.set(MODULE_ID, 'channels', channels);
        const curIdx = game.settings.get(MODULE_ID, 'currentChannel');
        if (curIdx >= channels.length) await game.settings.set(MODULE_ID, 'currentChannel', 0);
        ui.notifications.info('Cyberpunk Radio | Channels saved!');
        this.close();
      });
  }

  _wireColour(scope, pickerSel, textSel) {
    const picker = scope.querySelector(pickerSel);
    const text   = scope.querySelector(textSel);
    if (!picker || !text) return;
    picker.addEventListener('input', () => { text.value = picker.value; });
    text.addEventListener('input', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(text.value.trim())) picker.value = text.value.trim();
    });
  }

  _readFormChannels() {
    const channels = [];
    for (const chEl of this.element.querySelectorAll('.cp-config-channel')) {
      const rawFreq = chEl.querySelector('[name="ch-freq"]')?.value ?? '';
      const freqNum = parseFloat(rawFreq);
      channels.push({
        name:        chEl.querySelector('[name="ch-name"]')?.value        ?? 'Channel',
        freq:        Number.isFinite(freqNum) ? freqNum.toFixed(1) : '88.1',
        playlistId:  chEl.querySelector('[name="ch-playlistId"]')?.value  ?? '',
        tagline:     chEl.querySelector('[name="ch-tagline"]')?.value     ?? '',
        description: chEl.querySelector('[name="ch-description"]')?.value ?? '',
        bgColor:     chEl.querySelector('.cp-text-bg')?.value             ?? '#050810',
        accentColor: chEl.querySelector('.cp-text-accent')?.value         ?? '#00f5ff',
        bgImage:     chEl.querySelector('[name="ch-bgImage"]')?.value     ?? '',
        logo:        chEl.querySelector('[name="ch-logo"]')?.value        ?? '',
      });
    }
    return channels;
  }
}

/* ═══════════════════════════════════════════════════════
   MAIN RADIO APPLICATION
═══════════════════════════════════════════════════════ */
class CyberpunkRadioApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: 'cyberpunk-radio-app',
    classes: ['cyberpunk-radio'],
    tag: 'div',
    window: { title: 'CPRADIO.Title', icon: 'fas fa-broadcast-tower', resizable: false, minimizable: true },
    position: { width: 520, height: 'auto' },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/radio-app.hbs` }
  };

  static open() {
    if (!CyberpunkRadioApp.instance) CyberpunkRadioApp.instance = new CyberpunkRadioApp();
    CyberpunkRadioApp.instance.render({ force: true });
    return CyberpunkRadioApp.instance;
  }

  async _prepareContext(options) {
    const context    = await super._prepareContext(options);
    const channels   = RadioState.getChannels();
    const chIdx      = RadioState.getCurrentChannelIndex();
    const channel    = channels[chIdx] ?? null;
    const playlist   = RadioState.getCurrentPlaylist();
    const isPlaying  = game.settings.get(MODULE_ID, 'isPlaying');
    const volume     = game.settings.get(MODULE_ID, 'volume') ?? 0.5;
    const nowPlaying = RadioState.getNowPlaying();
    const isGM       = game.user.isGM;
    const canControl = isGM || game.settings.get(MODULE_ID, 'allowPlayerControl');
    const signalStrength = channel ? (playlist ? 5 : 2) : 0;
    const freq = channel ? (88.1 + chIdx * 1.3).toFixed(1) : '---.-';
    return {
      ...context,
      channels, chIdx, channel, playlist, isPlaying,
      volume: Math.round(volume * 100),
      volumeRaw: volume,
      nowPlaying: nowPlaying?.name ?? null,
      signalStrength, freq, isGM, canControl,
      hasChannels: channels.length > 0,
      theme: game.settings.get(MODULE_ID, 'theme') ?? 'cyberpunk',
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;

    // Use data-cp-action to avoid Foundry's own action dispatcher interfering
    for (const btn of el.querySelectorAll('[data-cp-action="switchChannel"]')) {
      btn.addEventListener('click', () => RadioState.switchChannel(parseInt(btn.dataset.index)));
    }

    el.querySelector('[data-cp-action="togglePlay"]')
      ?.addEventListener('click', () => RadioState.togglePlay());
    el.querySelector('[data-cp-action="nextTrack"]')
      ?.addEventListener('click', () => RadioState.nextTrack());
    el.querySelector('[data-cp-action="prevTrack"]')
      ?.addEventListener('click', () => RadioState.prevTrack());
    el.querySelector('[data-cp-action="toggleTheme"]')
      ?.addEventListener('click', async () => {
        const current = game.settings.get(MODULE_ID, 'theme') ?? 'cyberpunk';
        await game.settings.set(MODULE_ID, 'theme', current === 'cyberpunk' ? 'fantasy' : 'cyberpunk');
        // Re-render to update button label/icon
        this.render();
      });

    el.querySelector('[data-cp-action="openConfig"]')
      ?.addEventListener('click', () => {
        const cfg = new CyberpunkRadioConfig();
        cfg.render({ force: true });
        // Apply theme to config dialog after it renders
        Hooks.once('renderCyberpunkRadioConfig', () => {
          const theme = game.settings.get(MODULE_ID, 'theme') ?? 'cyberpunk';
          const cfgEl = document.getElementById('cyberpunk-radio-config');
          if (cfgEl) {
            cfgEl.classList.toggle('theme-fantasy',   theme === 'fantasy');
            cfgEl.classList.toggle('theme-cyberpunk', theme === 'cyberpunk');
          }
        });
      });

    const volSlider = el.querySelector('.cp-volume-slider');
    if (volSlider) {
      volSlider.addEventListener('input', () => {
        const d = el.querySelector('.cp-vol-value');
        if (d) d.textContent = Math.round(parseFloat(volSlider.value) * 100);
      });
      volSlider.addEventListener('change', () => {
        RadioState.setVolume(parseFloat(volSlider.value));
      });
    }

    // Wire the theme-toggle icon in the window header
    Promise.resolve().then(() => {
      this._applyChannelStyles(context.channel);
      this._updateSignalBars(context.signalStrength);
      this._applyTheme();
    });
  }


  /** Apply theme class to the app and any open config dialog */
  _applyTheme() {
    const theme  = game.settings.get(MODULE_ID, 'theme') ?? 'cyberpunk';
    const el     = this.element;
    const config = document.getElementById('cyberpunk-radio-config');

    if (el) {
      el.classList.toggle('theme-cyberpunk', theme === 'cyberpunk');
      el.classList.toggle('theme-fantasy',   theme === 'fantasy');
    }
    if (config) {
      config.classList.toggle('theme-cyberpunk', theme === 'cyberpunk');
      config.classList.toggle('theme-fantasy',   theme === 'fantasy');
    }
  }

  _applyChannelStyles(channel) {
    const bg     = channel?.bgColor     || '#050810';
    const accent = channel?.accentColor || '#00f5ff';
    // Escape backslashes/quotes so a stray character in a GM-entered URL
    // can't break out of the url(' ... ') string.
    const safeUrl = channel?.bgImage ? channel.bgImage.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';
    const bgImg   = safeUrl ? `url('${safeUrl}')` : 'none';
    for (const t of [
      this.element,
      this.element?.querySelector('.window-content'),
      this.element?.querySelector('.cp-radio-body'),
      this.element?.querySelector('.cp-display'),
    ]) {
      if (!t) continue;
      t.style.setProperty('--ch-bg',     bg);
      t.style.setProperty('--ch-accent', accent);
      t.style.setProperty('--ch-bg-img', bgImg);
    }
  }

  _updateSignalBars(strength) {
    this.element?.querySelectorAll('.cp-signal-bar')
      .forEach((bar, i) => bar.classList.toggle('active', i < strength));
  }

  async close(options) {
    CyberpunkRadioApp.instance = null;
    return super.close(options);
  }
}

/* ═══════════════════════════════════════════════════════
   HOOKS & SETTINGS
═══════════════════════════════════════════════════════ */
Hooks.once('init', () => {
  console.log('Cyberpunk Radio | Init v1.0.6');
  const rerender = () => CyberpunkRadioApp.instance?.render();

  game.settings.register(MODULE_ID, 'channels',       { scope: 'world', config: false, type: Array,   default: [],    onChange: rerender });
  game.settings.register(MODULE_ID, 'currentChannel', { scope: 'world', config: false, type: Number,  default: 0,     onChange: rerender });
  game.settings.register(MODULE_ID, 'isPlaying',      { scope: 'world', config: false, type: Boolean, default: false, onChange: rerender });
  game.settings.register(MODULE_ID, 'volume',         { scope: 'world', config: false, type: Number,  default: 0.5,   onChange: rerender });

  // Theme is client-scoped — each user picks their own visual style
  game.settings.register(MODULE_ID, 'theme', {
    scope: 'client', config: false, type: String, default: 'cyberpunk',
    onChange: () => CyberpunkRadioApp.instance?._applyTheme(),
  });

  game.settings.register(MODULE_ID, 'allowPlayerControl', {
    name: 'Allow Player Control',
    hint: 'Allow players to use play/pause, skip, and volume controls. Channel switching is always allowed.',
    scope: 'world', config: true, type: Boolean, default: true, restricted: true,
  });
  game.settings.register(MODULE_ID, 'showPlayerButton', {
    name: 'Show Radio Button in Player List',
    hint: 'Show the RADIO button at the bottom of the player list.',
    scope: 'world', config: true, type: Boolean, default: true, restricted: true,
    onChange: () => ui.players?.render(),
  });
});

Hooks.once('ready', () => {
  console.log('Cyberpunk Radio | Ready v1.0.6');
  game.cyberpunkRadio = {
    open:  () => CyberpunkRadioApp.open(),
    app:   CyberpunkRadioApp,
    state: RadioState,
  };

  /**
   * Socket listener.
   * Players send { type: 'playerRequest', action, ...payload }.
   * The GM processes it; resulting settings writes auto-sync to all clients.
   * Note: game.socket fires on ALL clients — the isGM guard ensures only the
   * GM executes world-mutating actions.
   */
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    if (data?.type === 'playerRequest' && game.user.isGM) {
      await RadioState.handlePlayerRequest(data);
    }
  });
});

Hooks.on('updatePlaylistSound', () => CyberpunkRadioApp.instance?.render());
Hooks.on('createPlaylistSound', () => CyberpunkRadioApp.instance?.render());

/** Add button to Scene Controls (left toolbar) */
Hooks.on('getSceneControlButtons', (controls) => {
  // Foundry v13: controls and tools are now Objects, not Arrays.
  
  // 1. Inject into standard control groups
  ["token", "tokens", "sounds"].forEach(name => {
    const group = controls[name];
    if (group && group.tools) {
      group.tools["cyberpunk-radio"] = {
        name: "cyberpunk-radio",
        title: "CPRADIO.Title",
        icon: "fas fa-broadcast-tower",
        button: true,
        visible: true,
        onClick: () => CyberpunkRadioApp.open()
      };
    }
  });

  // 2. Create a dedicated standalone category group
  controls["cyberpunk-radio"] = {
    name: "cyberpunk-radio",
    title: "CPRADIO.Title",
    icon: "fas fa-broadcast-tower",
    visible: true,
    tools: {
      "open-radio": {
        name: "open-radio",
        title: "CPRADIO.Title",
        icon: "fas fa-broadcast-tower",
        button: true,
        onClick: () => CyberpunkRadioApp.open()
      }
    },
    activeTool: "open-radio"
  };
});

/** Add button to Playlist Sidebar tab */
Hooks.on('renderPlaylistDirectory', (app, html) => {
  const el = html instanceof HTMLElement ? html : html[0];
  if (!el || el.querySelector('#cp-radio-sidebar-btn')) return;
  const header = el.querySelector('.directory-header .header-actions');
  if (header) {
    const btn = document.createElement('button');
    btn.id = 'cp-radio-sidebar-btn';
    btn.type = 'button';
    btn.classList.add('cp-radio-sidebar-btn');
    btn.title = 'Open Cyberpunk Radio';
    btn.innerHTML = `<i class="fas fa-broadcast-tower"></i> RADIO`;
    btn.addEventListener('click', () => CyberpunkRadioApp.open());
    header.appendChild(btn);
  }
});

Hooks.on('renderPlayerList', (app, html) => {
  if (!game.settings.get(MODULE_ID, 'showPlayerButton')) return;
  const el = html instanceof HTMLElement ? html : html[0];
  if (!el || el.querySelector('#cp-radio-player-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'cp-radio-player-btn';
  btn.title = 'Open Cyberpunk Radio';
  btn.innerHTML = `<i class="fas fa-broadcast-tower"></i> RADIO`;
  btn.addEventListener('click', () => CyberpunkRadioApp.open());
  const list = el.querySelector('#player-list');
  if (list) list.after(btn);
  else el.appendChild(btn);
});
