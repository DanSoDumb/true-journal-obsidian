// ---------- Obsidian UI ----------

/** Base for the plugin's dialogs: marks the dialog so it takes the plugin's palette. */
class ThemedModal extends Modal {
  /** Redraws the dialog where you were: emptying it would otherwise send it back to the top. */
  keepScroll(draw) {
    const tops = [this.modalEl.scrollTop, this.contentEl.scrollTop];
    draw();
    this.modalEl.scrollTop = tops[0];
    this.contentEl.scrollTop = tops[1];
  }
  open() {
    this.modalEl.addClass('tvj-modal');
    super.open();
    this.stopLocalizing = keepLocalized(this.modalEl);
  }
  close() {
    if (this.stopLocalizing) this.stopLocalizing();
    super.close();
  }
}

// Pane layouts offered by the Layout button: each entry is the panes from left to right ('note' = the side pane
// that trade notes and chart drawings open in).
const LAYOUTS = [
  { label: 'Dashboard · Journal · Note', hint: 'Stats on the left, trade list in the middle, the trade you click on the right.', panes: [VIEW_TYPE, JOURNAL_VIEW_TYPE, 'note'] },
  { label: 'Lobby · Journal · Note', hint: 'Profile and rank on the left instead of the dashboard.', panes: [LOBBY_VIEW_TYPE, JOURNAL_VIEW_TYPE, 'note'] },
  { label: 'Journal · Note', hint: 'Two panes for writing and reviewing trades.', panes: [JOURNAL_VIEW_TYPE, 'note'] },
  { label: 'Dashboard · Journal', hint: 'Two panes, no note pane.', panes: [VIEW_TYPE, JOURNAL_VIEW_TYPE] },
  { label: 'Lobby only', hint: 'One pane.', panes: [LOBBY_VIEW_TYPE] },
  { label: 'Journal · Note · Music', hint: 'Write and review trades with your music on the right.', panes: [JOURNAL_VIEW_TYPE, 'note', MUSIC_VIEW_TYPE] },
  { label: 'Dashboard · Journal · Music', hint: 'Stats, trade list and your music side by side.', panes: [VIEW_TYPE, JOURNAL_VIEW_TYPE, MUSIC_VIEW_TYPE] },
];
const PANE_NAMES = { [VIEW_TYPE]: 'Dashboard', [JOURNAL_VIEW_TYPE]: 'Journal', [LOBBY_VIEW_TYPE]: 'Lobby', [GYM_VIEW_TYPE]: 'Gym', [TROPHY_VIEW_TYPE]: 'Trophies', [LESSONS_VIEW_TYPE]: 'Lessons', [LOGIC_VIEW_TYPE]: 'Logic tree', [MUSIC_VIEW_TYPE]: 'Music', [ACCOUNTS_VIEW_TYPE]: 'Accounts', note: 'Note' };

class LayoutModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Layout');
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'Pick how the plugin\'s panes sit side by side. Only this plugin\'s panes are rearranged; your other tabs stay where they are.' });
    const list = contentEl.createDiv({ cls: 'tvj-layouts' });
    for (const layout of LAYOUTS) {
      const b = list.createEl('button', { cls: 'tvj-layout' });
      const sketch = b.createDiv({ cls: 'tvj-layout-sketch' });
      for (const pane of layout.panes) sketch.createDiv({ cls: `tvj-layout-pane ${pane === 'note' ? 'is-note' : ''}`, text: PANE_NAMES[pane] });
      b.createDiv({ cls: 'tvj-layout-label', text: layout.label });
      b.createDiv({ cls: 'tvj-menu-sub', text: layout.hint });
      b.addEventListener('click', async () => {
        this.close();
        await this.plugin.applyLayout(layout.panes);
      });
    }
    contentEl.createDiv({ cls: 'tvj-options' }).createEl('button', { text: 'Close the plugin\'s panes' }).addEventListener('click', () => {
      this.close();
      this.plugin.closePanes();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
}

class StyleModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    const settings = this.plugin.settings;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Style');
    const section = (title) => {
      contentEl.createDiv({ cls: 'tvj-style-label', text: title });
      return contentEl.createDiv({ cls: 'tvj-swatches' });
    };
    const pick = async (key, value) => {
      settings[key] = value;
      await this.plugin.saveData(settings);
      this.plugin.applyLanguage();
      this.plugin.applyStyle();
      this.plugin.refreshViews();
      this.keepScroll(() => this.render());
    };

    const langs = section('Language');
    for (const [id, label] of [['auto', 'Auto (Obsidian language)'], ['en', 'English'], ['vi', 'Tiếng Việt']]) {
      const b = langs.createEl('button', { cls: `tvj-swatch ${settings.language === id ? 'is-active' : ''}` });
      b.createSpan({ text: label });
      b.addEventListener('click', () => pick('language', id));
    }

    const themes = section('Theme');
    const themeBtn = (id, label, chip) => {
      const b = themes.createEl('button', { cls: `tvj-swatch ${settings.theme === id ? 'is-active' : ''}` });
      const c = b.createSpan({ cls: 'tvj-swatch-chip' });
      if (chip) {
        c.style.background = chip.bg;
        c.createEl('i').style.background = chip.accent;
      } else c.style.background = 'linear-gradient(90deg, #1e1e1e 50%, #ffffff 50%)';
      b.createSpan({ text: label });
      b.addEventListener('click', () => pick('theme', id));
    };
    themeBtn('auto', 'Auto (Obsidian)');
    for (const [id, t] of Object.entries(THEMES)) themeBtn(id, t.label, t);

    // Monkeytype's themes, each tile drawn in its own colours, with a search
    contentEl.createDiv({ cls: 'tvj-style-label', text: 'Monkeytype themes' });
    contentEl.createEl('p', { cls: 'tvj-muted tvj-mt-credit', text: `${Object.keys(MONKEYTYPE_THEMES).length} themes from Monkeytype (monkeytype.com), many of them GMK keycap colourways. Each tile shows the theme in its own colours.` });
    const search = contentEl.createEl('input', { type: 'search', cls: 'tvj-mt-search', attr: { placeholder: 'Search: olivia, botanical, laser, nord …', 'aria-label': 'Search Monkeytype themes' } });
    search.value = this.mtQuery || '';
    const gallery = contentEl.createDiv({ cls: 'tvj-mt-gallery' });
    const fillGallery = () => {
      gallery.empty();
      const q = search.value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
      let shown = 0;
      for (const name of Object.keys(MONKEYTYPE_THEMES)) {
        const t = monkeytypeTheme(name);
        if (q && !t.label.includes(q)) continue;
        shown++;
        const id = `mt:${name}`;
        const b = gallery.createEl('button', { cls: `tvj-mt-theme${settings.theme === id ? ' is-active' : ''}`, attr: { title: t.label } });
        b.style.background = t.bg;
        b.style.color = t.text;
        b.createSpan({ cls: 'tvj-mt-name', text: t.label });
        const dots = b.createSpan({ cls: 'tvj-mt-dots' });
        for (const color of [t.accent, t.muted, t.text]) dots.createEl('i').style.background = color;
        b.addEventListener('click', () => { this.mtScroll = gallery.scrollTop; pick('theme', id); });
      }
      if (!shown) gallery.createEl('p', { cls: 'tvj-muted', text: 'No theme by that name.' });
    };
    search.addEventListener('input', () => { this.mtQuery = search.value; gallery.scrollTop = 0; fillGallery(); });
    fillGallery();
    gallery.scrollTop = this.mtScroll || 0;

    const pairs = section('Win / loss colours');
    const pairBtn = (id, label, colors) => {
      const b = pairs.createEl('button', { cls: `tvj-swatch ${settings.pair === id ? 'is-active' : ''}` });
      const dots = b.createSpan({ cls: 'tvj-swatch-dots' });
      for (const color of colors) dots.createEl('i').style.background = color;
      b.createSpan({ text: label });
      b.addEventListener('click', () => pick('pair', id));
    };
    pairBtn('auto', 'Auto', ['var(--color-green)', 'var(--color-red)']);
    const current = themeOf(settings.theme);
    if (current && current.error) pairBtn('theme', 'From theme', [current.accent, current.error]);
    for (const [id, x] of Object.entries(PAIRS)) pairBtn(id, x.label, [x.up, x.down]);

    const accents = section('Accent (buttons, meters, highlights)');
    const accentBtn = (value, label, color) => {
      const b = accents.createEl('button', { cls: `tvj-swatch ${settings.accent === value ? 'is-active' : ''}` });
      b.createSpan({ cls: 'tvj-swatch-dots' }).createEl('i').style.background = color;
      b.createSpan({ text: label });
      b.addEventListener('click', () => pick('accent', value));
    };
    accentBtn('auto', 'From theme', themeOf(settings.theme) ? themeOf(settings.theme).accent : 'var(--interactive-accent)');
    for (const color of ACCENTS) accentBtn(color, color, color);

    // A picture or a video of your own behind every screen of the plugin, kept in the vault next to the card pictures.
    contentEl.createDiv({ cls: 'tvj-style-label', text: 'Background picture or video (every screen)' });
    const wall = contentEl.createDiv({ cls: 'tvj-options tvj-wallpaper-row' });
    const has = !!this.plugin.pictureFile('wallpaper');
    const input = wall.createEl('input', { attr: { type: 'file', accept: 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,.mov,.m4v', hidden: 'true' } });
    const changed = async () => { await this.plugin.applyWallpaper(); this.render(); };
    input.addEventListener('change', async () => {
      if (input.files && input.files[0] && await this.plugin.savePicture('wallpaper', input.files[0])) await changed();
    });
    wall.createEl('button', { text: has ? 'Change the background' : 'Upload a picture or video' }).addEventListener('click', () => input.click());
    wall.createEl('button', { text: 'Use a video link' }).addEventListener('click', () => {
      new TextPromptModal(this.app, 'Paste a video link (YouTube, TikTok, Instagram…)', '', async (link) => {
        if (!await this.plugin.setPictureFromYouTube('wallpaper', link)) return;
        // without yt-dlp (or on a phone) only the video's cover can be fetched: it becomes a still background
        const now = this.plugin.pictureFile('wallpaper');
        if (now && !CARD_VIDEO_EXTS.includes(now.extension)) notify('The video could not be downloaded here (it needs yt-dlp on a computer), so its cover is the background for now.');
        await changed();
      }).open();
    });
    if (has) {
      wall.createEl('button', { text: 'Remove the background' }).addEventListener('click', async () => { if (await this.plugin.savePicture('wallpaper', null)) await changed(); });
      // two labelled rows of pills: how much the theme's colour washes over it, and how it sits on the screen
      const opts = contentEl.createDiv({ cls: 'tvj-wall-opts' });
      const row = (label, choices, current, key) => {
        const line = opts.createDiv({ cls: 'tvj-wall-opt' });
        line.createDiv({ cls: 'tvj-wall-opt-label', text: label });
        const pills = line.createDiv({ cls: 'tvj-pills' });
        for (const [value, text] of choices) {
          pills.createEl('button', { cls: `tvj-pill ${current === value ? 'is-on' : ''}`, text }).addEventListener('click', async () => {
            settings[key] = value;
            await this.plugin.saveData(settings);
            await changed();
          });
        }
      };
      row('Brightness', WALLPAPER_DIMS, settings.wallpaperDim || 55, 'wallpaperDim');
      row('Size', [['fill', 'Fill the screen'], ['fit', 'Show all of it']], settings.wallpaperFit || 'fill', 'wallpaperFit');
    }

    // Glass: the whole journal in clear, liquid panels with a chrome rim, like Apple's Liquid Glass, on a silver-blue
    // backdrop (or your background picture).
    contentEl.createDiv({ cls: 'tvj-style-label', text: 'Glass look (beta)' });
    const glass = contentEl.createDiv({ cls: 'tvj-pills' });
    for (const [value, text] of [[false, 'Plain'], [true, 'Glass']]) {
      glass.createEl('button', { cls: `tvj-pill ${!!settings.glass === value ? 'is-on' : ''}`, text }).addEventListener('click', async () => {
        settings.glass = value;
        await this.plugin.saveData(settings);
        this.plugin.applyStyle();
        this.keepScroll(() => this.render()); // stay at the Glass row
      });
    }
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'Clear, liquid panels with a silver rim on every screen, over a silver-blue backdrop or your background picture.' });

    contentEl.createDiv({ cls: 'tvj-options tvj-style-done' }).createEl('button', { text: 'Done', cls: 'mod-cta' }).addEventListener('click', () => this.close());
  }
  onClose() {
    this.contentEl.empty();
  }
}

class NewTradeModal extends ThemedModal {
  /** `item` = { file, trade } to edit that trade's numbers; without it the form creates a new trade note. */
  constructor(app, plugin, item) {
    super(app);
    this.plugin = plugin;
    this.item = item || null;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    this.f = {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      symbol: 'NQ', direction: 'long', entry: '', exit: '', stop: '', qty: '1', pointValue: '20', fees: '0',
      account: plugin.settings.lastAccount || '', setups: '', tags: '', mistakes: '', thesis: '', notes: '', exitTime: '', exitDate: '',
      market: plugin.settings.lastMarket === 'cfd' ? 'cfd' : 'futures', pnlOverride: '',
      pnlOnly: false, pnl: '', // pnl: the P&L before fees, when it is typed in instead of prices
      scaledOut: false, exitsText: '', // partial exits: one per line, "1 @ 29,529.25 20:56" (see parseExitLines)
      kind: '', // '' a trade you took, or 'missed' / 'backtest' (journaled, counted nowhere)
    };
    if (item) {
      const t = item.trade;
      Object.assign(this.f, {
        date: t.date, time: t.time, symbol: t.symbol, direction: t.direction, entry: String(t.entry), exit: String(t.exit),
        stop: t.stop === null ? '' : String(t.stop), qty: String(t.qty), pointValue: String(t.pointValue), fees: String(t.fees),
        account: t.account, setups: (t.setups || []).join(', '), tags: t.tags.join(', '), mistakes: t.mistakes.join(', '),
      });
      this.duration = t.duration; // kept as it is unless a new exit time is typed
      this.f.market = t.market === 'cfd' ? 'cfd' : 'futures';
      this.f.pnlOverride = Number.isFinite(t.pnlOverride) ? String(t.pnlOverride) : '';
      if (t.pnlOnly) Object.assign(this.f, { pnlOnly: true, pnl: String(Math.round((netPnl(t) + t.fees) * 100) / 100), entry: '', exit: '', pnlOverride: '' });
      if ((t.exits || []).length > 1) Object.assign(this.f, { scaledOut: true, exitsText: t.exits.join('\n') });
      this.f.kind = t.kind || '';
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', this.item ? 'Edit trade' : 'New trade');
    if (!this.item) {
      // or bring in a whole export at once
      const other = contentEl.createDiv({ cls: 'tvj-import-switch' });
      other.createSpan({ cls: 'tvj-muted', text: 'Have an export from your platform?' });
      other.createEl('button', { text: 'Import trades', cls: 'mod-cta' }).addEventListener('click', () => { this.close(); new ImportCsvModal(this.app, this.plugin).open(); });
    }
    // a missed or backtested trade is journaled like any other but counted nowhere
    new Setting(contentEl).setName('Trade').setDesc(this.f.kind ? 'Not counted in your P&L, the calendar, your accounts, the rank or the challenge tracker. It is still in the Journal and can be reviewed.' : 'A trade you took. Missed and backtested trades can be journaled too; they are not counted.')
      .addDropdown((d) => d.addOption('', 'Taken').addOption('missed', 'Missed').addOption('backtest', 'Backtest').setValue(this.f.kind).onChange((v) => { this.f.kind = v; this.keepScroll(() => this.onOpen()); }));
    // every field that feeds the result refreshes the "Calculated" line under the form's numbers
    let preview = null;
    const refresh = () => { if (preview) preview(); };
    this.inputs = {}; // field -> its input, so a wrong value can be pointed out
    const text = (name, key, placeholder) =>
      new Setting(contentEl).setName(name).addText((c) => {
        this.inputs[key] = c.inputEl;
        c.setPlaceholder(placeholder || '').setValue(this.f[key]).onChange((v) => { this.f[key] = v; refresh(); });
      });
    // prices and amounts get their thousands commas while typing, so "29,815.50" never has to be typed by hand
    const amount = (c, key) => {
      this.inputs[key] = c.inputEl;
      c.inputEl.inputMode = 'decimal';
      c.setValue(withThousands(this.f[key]));
      c.inputEl.addEventListener('input', () => { formatAmountInput(c.inputEl); this.f[key] = c.inputEl.value; refresh(); });
    };
    const price = (name, key, placeholder) =>
      new Setting(contentEl).setName(name).addText((c) => { amount(c, key); c.setPlaceholder(placeholder || '').onChange((v) => { this.f[key] = v; refresh(); }); });

    // date: the browser's own calendar
    new Setting(contentEl).setName('Entry date').addText((c) => {
      this.inputs.date = c.inputEl;
      c.inputEl.type = 'date';
      c.inputEl.classList.add('tvj-date');
      c.setValue(this.f.date).onChange((v) => { this.f.date = v; });
    });
    // times: two lists, hours 00-23 and minutes, so the clock is always 24-hour whatever the device is set to
    const clock = (name, key, optional, desc) => {
      const row = new Setting(contentEl).setName(name);
      if (desc) row.setDesc(desc);
      const [h0, m0] = /^\d{1,2}:\d{2}$/.test(this.f[key]) ? this.f[key].split(':') : ['', ''];
      const pad2 = (k) => String(k).padStart(2, '0');
      const make = (count, current, label) => {
        const el = row.controlEl.createEl('select', { cls: 'dropdown tvj-clock', attr: { 'aria-label': label } });
        if (optional) el.createEl('option', { text: '--', value: '' });
        for (let k = 0; k < count; k++) el.createEl('option', { text: pad2(k), value: pad2(k) });
        el.value = current === '' ? (optional ? '' : '00') : pad2(Number(current));
        return el;
      };
      const hour = make(24, h0, `${name}: hour`);
      row.controlEl.createSpan({ cls: 'tvj-clock-sep', text: ':' });
      const minute = make(60, m0, `${name}: minute`);
      const update = (changed) => {
        // picking one half of an empty optional time fills the other with 00; clearing one clears both
        if (optional && changed.value === '') { hour.value = ''; minute.value = ''; }
        else if (optional) { if (hour.value === '') hour.value = '00'; if (minute.value === '') minute.value = '00'; }
        this.f[key] = hour.value === '' ? '' : `${hour.value}:${minute.value}`;
      };
      hour.addEventListener('change', () => update(hour));
      minute.addEventListener('change', () => update(minute));
    };
    clock('Entry time', 'time', false);
    const pnlOnly = !!this.f.pnlOnly;
    // a trade held overnight (or over a weekend) closes on a later day
    if (!pnlOnly) {
      let exitDesc = 'Only for a trade held overnight — leave empty when it closed the same day.';
      if (this.item && this.duration) {
        const out = new Date(Date.parse(`${this.item.trade.date}T${this.item.trade.time}:00Z`) + this.duration * 1000);
        if (Number.isFinite(out.getTime())) {
          exitDesc = `Saved exit: ${out.toISOString().slice(0, 10)} ${out.toISOString().slice(11, 16)} (held ${shortDuration(this.duration)}). Leave the exit empty to keep it.`;
        }
      }
      new Setting(contentEl).setName('Exit date').setDesc(exitDesc).addText((c) => {
        c.inputEl.type = 'date';
        c.inputEl.classList.add('tvj-date');
        c.setValue(this.f.exitDate).onChange((v) => { this.f.exitDate = v; });
      });
      clock('Exit time', 'exitTime', true, this.duration ? 'Leave empty to keep the saved duration.' : 'Optional — used for the duration charts.');
    }

    // market and symbol decide what a 1.0 move is worth; the number stays editable
    let pointValueInput;
    let symbolList = null;
    const fillSymbols = () => {
      symbolList.empty();
      for (const sym of Object.keys(INSTRUMENTS[this.f.market])) symbolList.createEl('option', { value: sym });
    };
    const applyInstrument = () => {
      const value = instrumentValue(this.f.market, this.f.symbol);
      if (value && pointValueInput) {
        this.f.pointValue = String(value);
        pointValueInput.setValue(this.f.pointValue);
      }
      refresh();
    };
    new Setting(contentEl).setName('Market').setDesc('Futures are counted in contracts, CFDs (FTMO, The5ers …) in lots.').addDropdown((d) => d.addOption('futures', 'Futures').addOption('cfd', 'CFD').setValue(this.f.market).onChange((v) => {
      this.f.market = v;
      fillSymbols();
      applyInstrument();
    }));
    new Setting(contentEl).setName('Symbol').setDesc('Pick from the list or type your own.').addText((c) => {
      symbolList = contentEl.createEl('datalist', { attr: { id: 'tvj-symbols' } });
      fillSymbols();
      this.inputs.symbol = c.inputEl;
      c.inputEl.setAttribute('list', 'tvj-symbols');
      c.inputEl.style.textTransform = 'uppercase'; // symbols are stored in capitals; show them that way while typing
      c.setValue(this.f.symbol).onChange((v) => {
        this.f.symbol = v.toUpperCase();
        applyInstrument();
      });
    });
    new Setting(contentEl).setName('Direction').addDropdown((d) => d.addOption('long', 'Long').addOption('short', 'Short').setValue(this.f.direction).onChange((v) => { this.f.direction = v; refresh(); }));
    // a quick entry: the P&L of a trade, or of the whole day, with no prices (the form is drawn again without them)
    new Setting(contentEl).setName('Enter the P&L directly instead of prices')
      .setDesc('For a quick entry: what a trade made, or your whole day. Fees below are still taken off. It counts as one trade in your stats.')
      .addToggle((c) => c.setValue(pnlOnly).onChange((v) => { this.f.pnlOnly = v; this.keepScroll(() => this.onOpen()); }));
    let result = null, pnlRow = null;
    if (pnlOnly) {
      pnlRow = new Setting(contentEl).setName('P&L ($)').addText((c) => { amount(c, 'pnl'); c.setPlaceholder('e.g. 450 or -120.50'); });
    } else {
      price('Entry price', 'entry', 'e.g. 29,815.50');
      // scaled out: the exits one per line instead of one exit price and size (the size is their total)
      new Setting(contentEl).setName('Partial exits').setDesc('Closed in parts (scaled out): type each exit with its size instead of one exit price.')
        .addToggle((c) => c.setValue(!!this.f.scaledOut).onChange((v) => { this.f.scaledOut = v; this.keepScroll(() => this.onOpen()); }));
      if (this.f.scaledOut) {
        new Setting(contentEl).setName('Exits').setDesc('One per line: size @ price, and the time if you know it. E.g. "1 @ 29,529.25 20:56".').addTextArea((c) => {
          this.inputs.exitsText = c.inputEl;
          c.inputEl.rows = 3;
          c.setPlaceholder('1 @ 29,529.25 20:56\n1 @ 29,560.50 20:58').setValue(this.f.exitsText).onChange((v) => { this.f.exitsText = v; refresh(); });
        });
      } else price('Exit price', 'exit', 'e.g. 29,830.25');
      price('Stop loss', 'stop', 'optional — used for R');
      if (!this.f.scaledOut) text('Size (contracts or lots)', 'qty', '1 contract, or 0.10 lot');
      new Setting(contentEl).setName('Value of a 1.0 move ($)').setDesc('Per contract or per 1.00 lot. Filled in from the symbol; for a CFD it is the platform\'s contract size.').addText((c) => {
        pointValueInput = c;
        this.inputs.pointValue = c.inputEl;
        c.setValue(this.f.pointValue).onChange((v) => { this.f.pointValue = v; refresh(); });
      });
    }
    text('Fees ($)', 'fees');
    // the result: what the numbers above give, and a place to type the broker's own figure instead
    if (!pnlOnly) result = new Setting(contentEl).setName('Net P&L ($)').addText((c) => {
      amount(c, 'pnlOverride');
      c.setPlaceholder('leave empty to use the calculation').onChange((v) => { this.f.pnlOverride = v; refresh(); });
    });
    preview = () => {
      const num = formNumber;
      if (pnlRow) {
        const base = num(this.f.pnl), fees = Number.isFinite(num(this.f.fees)) ? num(this.f.fees) : 0;
        const net = money(Math.round((base - fees) * 100) / 100);
        pnlRow.setDesc(Number.isFinite(base) ? (LANG === 'vi' ? `Trước phí. Sau phí: ${net}` : `Before fees. After fees: ${net}`) : tx('Before fees, e.g. 450 or -120.50.'));
        return;
      }
      const parts = this.f.scaledOut ? parseExitLines(this.f.exitsText) : null;
      const t = { entry: num(this.f.entry), exit: parts ? parts.exit : num(this.f.exit), qty: parts ? parts.qty : num(this.f.qty), pointValue: num(this.f.pointValue), fees: Number.isFinite(num(this.f.fees)) ? num(this.f.fees) : 0, direction: this.f.direction };
      const ready = [t.entry, t.exit, t.qty, t.pointValue].every(Number.isFinite);
      const typed = num(this.f.pnlOverride);
      const calc = ready ? `Calculated from the prices: ${money(Number(computedPnl(t).toFixed(2)))}` : 'Calculated from the prices once entry, exit and size are filled in';
      result.setDesc(Number.isFinite(typed) ? `${calc} · your figure is used: ${money(typed)}` : `${calc}. Type the broker's figure here if it differs (CFD pairs not quoted in USD, swaps, commissions).`);
    };
    preview();
    new Setting(contentEl).setName('Account').setDesc('Pick one of your accounts or type a new name.').addText((c) => {
      const list = contentEl.createEl('datalist', { attr: { id: 'tvj-accounts' } });
      const known = this.plugin.getTrades().map((x) => x.trade);
      for (const a of this.plugin.allAccounts(known)) {
        // blown accounts are not offered for new trades (typing the name still works)
        if (a !== NO_ACCOUNT && !accountStatus(a, known, this.plugin.settings.accountInfo).blown) list.createEl('option', { value: a });
      }
      c.inputEl.setAttribute('list', 'tvj-accounts');
      c.setValue(this.f.account).onChange((v) => { this.f.account = v; });
    });
    text('Setups', 'setups', 'comma separated');
    text('Tags', 'tags', 'comma separated');
    text('Mistakes', 'mistakes', 'comma separated');
    if (this.item) {
      contentEl.createEl('p', { cls: 'tvj-muted', text: 'Thesis, notes and the review are edited in the trade note itself.' });
      const row = new Setting(contentEl);
      row.addButton((b) => b.setButtonText('Delete trade').onClick(() => this.remove()));
      row.addButton((b) => b.setButtonText('Save changes').setCta().onClick(() => this.save()));
      return;
    }
    new Setting(contentEl).setName('Thesis').addTextArea((c) => c.setValue(this.f.thesis).onChange((v) => { this.f.thesis = v; }));
    new Setting(contentEl).setName('Notes').addTextArea((c) => c.setValue(this.f.notes).onChange((v) => { this.f.notes = v; }));
    if (window.ExcalidrawAutomate) {
      new Setting(contentEl)
        .setName('Open an Excalidraw chart for this trade')
        .setDesc('Paste screenshots and draw on them; the drawing is embedded in the trade note.')
        .addToggle((c) => c.setValue(!!this.withChart).onChange((v) => { this.withChart = v; }));
    }
    new Setting(contentEl).addButton((b) => b.setButtonText('Save trade').setCta().onClick(() => this.save()));
  }

  async save() {
    const f = this.f;
    const num = formNumber;
    const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
    const pnlOnly = !!f.pnlOnly;
    const fees = Number.isFinite(num(f.fees)) ? num(f.fees) : 0, base = num(f.pnl);
    const parts = !pnlOnly && f.scaledOut ? parseExitLines(f.exitsText) : null;
    const trade = {
      id: this.item ? this.item.trade.id : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      date: f.date.trim(), time: f.time.trim() || '00:00', symbol: f.symbol.trim().toUpperCase(), direction: f.direction,
      entry: pnlOnly ? 0 : num(f.entry), exit: pnlOnly ? 0 : parts ? parts.exit : num(f.exit), stop: !pnlOnly && Number.isFinite(num(f.stop)) ? num(f.stop) : null,
      qty: pnlOnly ? 1 : parts ? parts.qty : num(f.qty), exits: parts && parts.legs ? parts.legs : [], pointValue: pnlOnly ? instrumentValue(f.market, f.symbol.trim().toUpperCase()) || 1 : num(f.pointValue), fees,
      account: f.account.trim(), setups: [...new Set(list(f.setups))], tags: list(f.tags), mistakes: list(f.mistakes),
      thesis: f.thesis.trim(), notes: f.notes.trim(), reviewed: false, review: [],
      duration: pnlOnly ? null : this.duration || null,
      market: f.market === 'cfd' ? 'cfd' : 'futures',
      // typed in directly: the P&L before fees, less the fees, is the trade's net result
      pnlOverride: pnlOnly ? Math.round((base - fees) * 100) / 100 : String(f.pnlOverride).trim() === '' ? null : formNumber(f.pnlOverride),
      ...(pnlOnly ? { pnlOnly: true } : {}),
      kind: TRADE_KINDS[f.kind] ? f.kind : '',
    };
    // one message per field, in the order of the form, with the field outlined
    const typed = (key) => String(f[key] === undefined || f[key] === null ? '' : f[key]).trim() !== '';
    const today = isoDay(new Date());
    const problem =
      !/^\d{4}-\d{2}-\d{2}$/.test(trade.date) ? ['date', 'Pick the entry date.']
        : trade.date > today ? ['date', 'The entry date is in the future: pick the day you took the trade.']
          : !trade.symbol ? ['symbol', 'Type the symbol, for example NQ.']
            : pnlOnly ? (!typed('pnl') ? ['pnl', 'Type the P&L, for example 450 or -120.50.']
              : !Number.isFinite(base) ? ['pnl', 'The P&L is not a number: type it like 450 or -120.50.']
                : typed('fees') && !Number.isFinite(num(f.fees)) ? ['fees', 'Fees must be a number, for example 3.78 (or 0).'] : null)
            : !typed('entry') ? ['entry', 'Type the entry price.']
              : !Number.isFinite(trade.entry) ? ['entry', 'The entry price is not a number: type it like 29,815.50.']
                : parts && parts.error ? ['exitsText', LANG === 'vi' ? `Không đọc được dòng "${parts.error}": viết như 1 @ 29,529.25 20:56.` : `This line can't be read: "${parts.error}". Write it like 1 @ 29,529.25 20:56.`]
                : parts && parts.legs.length < 2 ? ['exitsText', 'Type at least two exits, one per line — or switch Partial exits off.']
                : !parts && !typed('exit') ? ['exit', 'Type the exit price.']
                  : !Number.isFinite(trade.exit) ? ['exit', 'The exit price is not a number: type it like 29,830.25.']
                    : typed('stop') && !Number.isFinite(num(f.stop)) ? ['stop', 'The stop loss is not a number: fix it, or leave it empty.']
                      : !(trade.qty > 0) ? ['qty', 'Type the size: 1 contract, or 0.10 lot.']
                        : !(trade.pointValue > 0) ? ['pointValue', 'The value of a 1.0 move must be a number above 0.']
                          : typed('fees') && !Number.isFinite(num(f.fees)) ? ['fees', 'Fees must be a number, for example 3.78 (or 0).']
                            : trade.pnlOverride !== null && !Number.isFinite(trade.pnlOverride) ? ['pnlOverride', 'Net P&L must be a number, for example 250 or -120.50 — or leave it empty.']
                              : null;
    if (problem) {
      this.pointOut(problem[0], problem[1]);
      return;
    }
    // exit date and time give how long the trade lasted. The exit date is for a trade held overnight; without one,
    // an exit time earlier than the entry is taken as past midnight. The trade stays on the day it was opened.
    const out = pnlOnly ? null : f.exitTime.trim().match(/^(\d{1,2}):(\d{2})$/);
    const exitDay = pnlOnly ? '' : String(f.exitDate || '').trim();
    if (exitDay && !out) {
      notify('Add the exit time for the exit date.');
      return;
    }
    const start = Date.parse(`${trade.date}T${trade.time}:00Z`);
    if (out && Number.isFinite(start)) {
      let end = Date.parse(`${exitDay || trade.date}T${out[1].padStart(2, '0')}:${out[2]}:00Z`);
      if (!exitDay && end < start) end += 86400000;
      if (!(end >= start)) {
        notify('The exit is before the entry — check the exit date and time.');
        return;
      }
      trade.duration = (end - start) / 1000 || null;
    }
    if (this.item) {
      await this.plugin.updateTradeNote(this.item.file, trade);
      if (trade.account && isCounted(trade)) await this.plugin.addAccount(trade.account, '');
      notify(`Trade updated: ${money(netPnl(trade))}`);
      this.close();
      return;
    }
    const file = await this.plugin.createTradeNote(trade);
    if (file) {
      // a missed or backtested trade touches no account: no last-used account, no max-loss or rule warnings
      if (trade.account && isCounted(trade)) {
        this.plugin.settings.lastAccount = trade.account;
        this.plugin.settings.lastMarket = trade.market;
        await this.plugin.addAccount(trade.account, '');
      }
      notify(isCounted(trade) ? `Trade saved: ${money(netPnl(trade))}` : `${tx(TRADE_KINDS[trade.kind])} ${tx('trade saved (not counted)')}: ${money(netPnl(trade))}`);
      if (trade.account && isCounted(trade)) {
        // did this trade take the account past its max loss?
        const before = this.plugin.getTrades().map((x) => x.trade).filter((t) => t.id !== trade.id);
        const info = this.plugin.settings.accountInfo;
        if (!accountStatus(trade.account, before, info).blown && accountStatus(trade.account, [...before, trade], info).blown) {
          notify(`${trade.account} hit its max loss and is now marked as blown.`);
        }
        // and what it brings close: the daily loss, the max loss, the size limit, consistency
        const news = (this.plugin.settings.calendarCache && this.plugin.settings.calendarCache.events) || [];
        for (const w of tradeWarnings(challengeStatus(trade.account, [...before, trade], info), trade, isoDay(new Date()), news)) new Notice(`⚠ ${trade.account}: ${w}`, 9000);
      }
      this.close();
      if (this.withChart) await this.plugin.openChart(file);
      else await this.plugin.openInSide(file);
    }
  }

  /** Says what is wrong with one field, outlines it and puts the cursor in it; the outline goes once it is edited. */
  pointOut(key, message) {
    notify(message);
    const input = this.inputs && this.inputs[key];
    if (!input) return;
    input.classList.add('tvj-invalid');
    input.addEventListener('input', () => input.classList.remove('tvj-invalid'), { once: true });
    input.addEventListener('change', () => input.classList.remove('tvj-invalid'), { once: true });
    if (typeof input.focus === 'function') input.focus();
  }

  async remove() {
    const t = this.item.trade;
    if (!ask(`Delete the trade ${t.symbol} ${t.direction} of ${t.date}? The note goes to the trash.`)) return;
    await this.app.vault.trash(this.item.file, true);
    notify('Trade deleted.');
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Trades already in the journal that are parts of one position: adds that closed together (pyramid entries) and
 *  one entry closed in steps (partial exits). Tick the groups to combine; each becomes one trade. */
class PyramidModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.skip = new Set(); // "<kind>|<first note path>" of the groups left out
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Combine trades');
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'Trades that are parts of one position: adds that closed together at the same price (pyramid entries), and one entry closed in parts (partial exits). Each group you tick becomes one trade: sizes add up, prices are size-weighted averages, and the P&L stays exactly the sum of the parts.' });
    const items = this.plugin.getTrades('own');
    const itemOf = new Map(items.map((x) => [x.trade, x]));
    const all = [
      ...pyramidGroups(items.map((x) => x.trade)).map((g) => ({ kind: 'pyramid', g: g.map((t) => itemOf.get(t)) })),
      ...partialExitGroups(items.map((x) => x.trade)).map((g) => ({ kind: 'partial', g: g.map((t) => itemOf.get(t)) })),
    ];
    if (!all.length) {
      contentEl.createEl('p', { text: 'No trades look like parts of one position, so there is nothing to combine.' });
      return;
    }
    const list = contentEl.createDiv({ cls: 'tvj-pyramid-list' });
    for (const { kind, g } of all) {
      const key = `${kind}|${g[0].file.path}`;
      const merged = (kind === 'partial' ? mergePartialExits : mergePyramid)(g.map((x) => x.trade));
      const row = list.createEl('label', { cls: 'tvj-pyramid-group' });
      const box = row.createEl('input', { attr: { type: 'checkbox' } });
      box.checked = !this.skip.has(key);
      box.addEventListener('change', () => { if (box.checked) this.skip.delete(key); else this.skip.add(key); this.render(); });
      const info = row.createDiv();
      info.createDiv({ cls: 'tvj-pyramid-title', text: `${merged.date} · ${merged.symbol} ${merged.direction} · ${merged.account || NO_ACCOUNT} · ${tx(kind === 'partial' ? 'partial exits' : 'pyramid entries')}` });
      for (const leg of kind === 'partial' ? merged.exits : merged.entries) info.createDiv({ cls: 'tvj-muted', text: leg });
      const pnl = netPnl(merged);
      const result = info.createDiv({ cls: 'tvj-pyramid-result' });
      result.createSpan({ text: `→ ${merged.qty} @ ${Number(merged.entry.toFixed(2))}, exit ${Number(merged.exit.toFixed(2))} · ` });
      result.createSpan({ cls: pnl < 0 ? 'tvj-neg' : 'tvj-pos', text: money(Math.round(pnl * 100) / 100) });
    }
    const chosen = all.filter(({ kind, g }) => !this.skip.has(`${kind}|${g[0].file.path}`));
    new Setting(contentEl).addButton((b) => b.setButtonText(`Combine ${chosen.length} group(s)`).setCta().setDisabled(!chosen.length).onClick(async () => {
      b.setDisabled(true);
      // pyramids first: a position can have been added to and then closed in parts
      for (const { kind, g } of [...chosen].sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'pyramid' ? -1 : 1))) {
        if (g.every((x) => this.app.vault.getAbstractFileByPath(x.file.path))) await this.plugin.combineTradeNotes(g, kind);
      }
      notify(`Combined ${chosen.length} group(s) into one trade each.`);
      this.close();
    }));
  }
  onClose() {
    this.contentEl.empty();
  }
}

class ImportCsvModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.account = plugin.settings.lastAccount || '';
    this.accountChoice = null; // an existing account's name, '__file' (names in the file) or '__new'
    this.newName = '';
    this.platform = 'auto';
    this.pyramids = true; // combine trades that close at the same second (adds to one position)
    this.partials = true; // combine trades that share one entry and close in steps (scaling out)
    this.unpicked = new Set(); // ids of new trades unticked in the list; every new trade starts ticked
    this.rows = null;
    this.text = null;
    this.fileName = '';
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Import trades');
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'Export your trades from your platform and choose the file. Use the original file, not one edited in a spreadsheet. The file is read on this computer only.' });
    new Setting(contentEl).setName('Platform').addDropdown((d) => {
      d.addOption('auto', tx('Auto-detect'));
      for (const f of platformChoices()) d.addOption(f.id, tx(f.label));
      d.setValue(this.platform).onChange((v) => { this.platform = v; this.render(); });
    });
    const chosen = platformChoices().find((f) => f.id === this.platform);
    contentEl.createEl('p', { cls: 'tvj-muted', text: chosen ? chosen.help : 'Auto-detect reads exports from TopstepX, Tradovate, cTrader, MetaTrader 4 / 5, Interactive Brokers, ATAS, Hyperliquid, Rithmic, TradingView Paper Trading, Blofin, Bybit, Sierra Chart, TradeZero, Trading Technologies and NinjaTrader — CSV, tab-separated, HTML or Excel (.xlsx). Anything else with one row per trade or per fill works too; pick a platform by hand to see how to export from it.' });
    const trades = this.plugin.getTrades().map((x) => x.trade);
    const info = this.plugin.settings.accountInfo || {};
    const known = [...new Set([...(this.plugin.settings.accounts || []), ...this.plugin.allAccounts(trades)])].filter((a) => a && a !== NO_ACCOUNT).sort((a, b) => a.localeCompare(b));
    if (this.accountChoice === null) this.accountChoice = known.includes(this.account) ? this.account : known.length ? known[0] : '__new';
    this.account = this.accountChoice === '__file' ? '' : this.accountChoice === '__new' ? this.newName.trim() : this.accountChoice;
    new Setting(contentEl).setName('Account for these trades').setDesc('Pick one of your accounts, keep the names in the file, or start a new one.').addDropdown((d) => {
      for (const a of known) {
        if (this.plugin.hiddenInPickers(a, trades, this.accountChoice)) continue;
        const st = accountStatus(a, trades, info);
        d.addOption(a, st.blown ? `${a} · ${tx('blown')}` : st.passed ? `${a} · ${tx('passed')}` : a);
      }
      d.addOption('__file', tx('Account names in the file'));
      d.addOption('__new', tx('New account…'));
      d.setValue(this.accountChoice).onChange((v) => { this.accountChoice = v; this.render(); });
    });
    if (this.accountChoice === '__new') {
      new Setting(contentEl).setName('New account name').addText((c) => {
        c.setPlaceholder('Combine 50K #1').setValue(this.newName).onChange((v) => { this.newName = v; this.account = v.trim(); });
        c.inputEl.addEventListener('blur', () => this.render()); // refresh the preview for the new name
      });
    }
    new Setting(contentEl).setName('Combine adds into one trade').setDesc('Trades on the same account and symbol that close at the same second become one trade with pyramid entries.')
      .addToggle((c) => c.setValue(this.pyramids).onChange((v) => { this.pyramids = v; this.render(); }));
    new Setting(contentEl).setName('Combine partial exits into one trade').setDesc('Rows with the same entry that close at different times or prices (scaling out) become one trade with partial exits.')
      .addToggle((c) => c.setValue(this.partials).onChange((v) => { this.partials = v; this.render(); }));
    const pick = contentEl.createDiv({ cls: 'tvj-options' });
    const input = pick.createEl('input', { type: 'file', attr: { accept: '.csv,.tsv,.txt,.html,.htm,.xlsx,text/csv,text/html' } });
    input.style.display = 'none';
    pick.createEl('button', { text: 'Choose file' }).addEventListener('click', () => input.click());
    pick.createSpan({ cls: 'tvj-muted', text: this.fileName || 'No file chosen' });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      this.fileName = file.name;
      this.unpicked = new Set();
      try {
        const read = await readExport(file.name, await file.arrayBuffer());
        this.rows = read.rows;
        this.text = read.text;
      } catch (e) {
        this.rows = [];
        notify(`Could not read ${file.name}: ${e.message}`);
      }
      this.render();
    });
    if (!this.rows) return;

    const result = importPlatform(this.rows, this.account.trim(), this.platform, { pyramids: this.pyramids, partials: this.partials });
    if (!result.format) {
      contentEl.createEl('p', { cls: 'tvj-neg', text: 'This file was not recognised. Pick the platform by hand, and check it is the export named under that platform.' });
      return;
    }
    if (result.missingColumns.length) {
      contentEl.createEl('p', { cls: 'tvj-neg', text: `This file is missing columns: ${result.missingColumns.join(', ')}.${result.format.id === 'topstepx' ? ' Export from the Trades tab, not Orders.' : ''}` });
      return;
    }
    contentEl.createEl('p', { cls: 'tvj-muted', text: `Read as: ${tx(result.format.label)}` });
    if (this.accountChoice === '__file' && result.trades.length && result.trades.every((t) => !t.account)) {
      contentEl.createEl('p', { cls: 'tvj-warn', text: 'This file has no account names, so these trades would have no account. Pick an account above.' });
    }
    const have = new Set(this.plugin.getTrades(null, true).map((x) => x.trade.id));
    const fresh = result.trades.filter((t) => !have.has(t.id));
    const isPicked = (t) => !have.has(t.id) && !this.unpicked.has(t.id);
    const tiles = contentEl.createDiv({ cls: 'tvj-tiles' });
    const tile = (label, value, cls) => {
      const el = tiles.createDiv({ cls: 'tvj-tile' });
      el.createDiv({ cls: 'tvj-tile-label', text: label });
      return el.createDiv({ cls: `tvj-sim-value ${cls || ''}`, text: value });
    };
    const pickedTile = tile('To import', '');
    tile('Already in the journal', String(result.trades.length - fresh.length));
    tile('Rows not readable', String(result.invalidRows));
    const netTile = tile('Net of the picked trades', '');
    if (result.open) tile('Still open, not imported', String(result.open));
    if (result.atLimit) contentEl.createEl('p', { cls: 'tvj-warn', text: LANG === 'vi' ? `File này có ${result.atLimit} lệnh đặt, mức tối đa nền tảng xuất ra: nó có thể bắt đầu giữa một lệnh, nên vài lệnh đầu có thể ghép sai. Hãy xuất Trade history thay thế.` : `This file holds ${result.atLimit} orders, the most the platform exports: it may start in the middle of a trade, so its first trades can pair wrong. Export Trade history instead.` });
    if (result.pyramids.groups) contentEl.createEl('p', { cls: 'tvj-muted', text: `${result.pyramids.legs} rows that closed together became ${result.pyramids.groups} trades with pyramid entries.` });
    if (result.partials && result.partials.groups) contentEl.createEl('p', { cls: 'tvj-muted', text: `${result.partials.legs} rows with the same entry became ${result.partials.groups} trades with partial exits.` });
    if (result.unknownSymbols.length) contentEl.createEl('p', { cls: 'tvj-warn', text: `No point value known for: ${result.unknownSymbols.join(', ')}. They are imported with a point value of 1 — edit those trades afterwards.` });
    if (result.pnlMismatches) contentEl.createEl('p', { cls: 'tvj-warn', text: `${result.pnlMismatches} trade(s) have a recomputed P&L that differs from the PnL column in the file — check them after importing.` });
    let button = null;
    // ticking a box only updates the counts and the button, so a long list keeps its scroll position
    const refresh = () => {
      const chosen = result.trades.filter(isPicked);
      const net = sum(chosen.map(netPnl));
      pickedTile.setText(`${chosen.length} of ${fresh.length}`);
      netTile.setText(cents(Math.round(net * 100) / 100));
      netTile.className = `tvj-sim-value ${!chosen.length ? '' : net < 0 ? 'tvj-neg' : 'tvj-pos'}`;
      if (button) button.setButtonText(tx(`Import ${chosen.length} trade${chosen.length === 1 ? '' : 's'}`)).setDisabled(!chosen.length);
    };
    this.tradeList(contentEl, result.trades, have, refresh);
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'Imported trades have no setup yet, and trades without a stop have no R until you add one with Edit.' });
    new Setting(contentEl).addButton((b) => {
      button = b;
      b.setCta().onClick(async () => {
        b.setDisabled(true);
        if (!(await this.importTrades(result.trades.filter(isPicked)))) b.setDisabled(false);
      });
    });
    refresh();
  }

  /** Every trade in the file in time order, with a tick box: new trades start ticked, trades already in the journal
   *  are greyed out and can't be ticked. Select all / Select none work on the new ones. */
  tradeList(parent, trades, have, onChange) {
    const head = parent.createDiv({ cls: 'tvj-import-head' });
    head.createSpan({ cls: 'tvj-card-title', text: 'Trades in the file' });
    const boxes = [];
    const pick = (t, on) => { if (on) this.unpicked.delete(t.id); else this.unpicked.add(t.id); };
    if (trades.filter((t) => !have.has(t.id)).length > 1) {
      const all = head.createSpan({ cls: 'tvj-import-all' });
      for (const [label, on] of [['Select all', true], ['Select none', false]]) {
        all.createEl('button', { cls: 'tvj-link', text: label }).addEventListener('click', () => {
          for (const { box, t } of boxes) { box.checked = on; pick(t, on); }
          onChange();
        });
      }
    }
    const list = parent.createDiv({ cls: 'tvj-import-list' });
    for (const t of [...trades].sort(byTime)) {
      const done = have.has(t.id);
      const row = list.createEl('label', { cls: `tvj-import-row${done ? ' is-imported' : ''}` });
      const box = row.createEl('input', { type: 'checkbox' });
      box.checked = !done && !this.unpicked.has(t.id);
      box.disabled = done;
      if (!done) {
        boxes.push({ box, t });
        box.addEventListener('change', () => { pick(t, box.checked); onChange(); });
      }
      row.createSpan({ cls: 'tvj-import-when', text: `${t.date} ${t.time}` });
      row.createSpan({ cls: 'tvj-import-symbol', text: t.symbol });
      row.createSpan({ cls: `tvj-side ${t.direction === 'long' ? 'is-long' : 'is-short'}`, text: t.direction });
      row.createSpan({ cls: 'tvj-muted tvj-import-detail', text: `${t.qty} · ${t.entry} → ${t.exit}` });
      const p = Math.round(netPnl(t) * 100) / 100;
      row.createSpan({ cls: `tvj-import-pnl ${done ? 'tvj-muted' : p < 0 ? 'tvj-neg' : 'tvj-pos'}`, text: done ? 'Already imported' : cents(p) });
    }
  }

  /** Writes the picked trades as notes; true when it went ahead. */
  async importTrades(chosen) {
    if (!chosen.length) return false;
    if (this.accountChoice === '__new' && (!this.account || /[,:\n]/.test(this.account))) {
      notify(this.account ? 'Account names cannot contain commas or colons.' : 'Type a name for the new account.');
      return false;
    }
    let done = 0;
    for (const trade of chosen) if (await this.plugin.createTradeNote(trade, true)) done++;
    if (this.account) this.plugin.settings.lastAccount = this.account;
    for (const a of new Set(chosen.map((t) => t.account).filter(Boolean))) await this.plugin.addAccount(a, '');
    notify(`Imported ${done} trades${this.account ? ` into ${this.account}` : ''}.`);
    this.close();
    return true;
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** Export a period of the journal as a package, or import a package someone sent you. */
class PackageModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.period = 'd30';
    this.scope = 'all';
    this.name = '';
    this.withMedia = true;
    this.incoming = null; // { fileName, files, root, manifest }
  }
  onOpen() {
    this.render();
  }

  async render() {
    const { contentEl } = this;
    const plugin = this.plugin;
    const own = plugin.getTrades('own');
    const groups = parseGroups(plugin.settings.groups);
    const picked = new Set(filterScope(filterExportPeriod(own.map((x) => x.trade), this.period), this.scope, groups));
    const items = own.filter((x) => picked.has(x.trade));
    const pack = await plugin.collectPackage(items, this.withMedia);
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Share for review');

    // ---- export ----
    contentEl.createDiv({ cls: 'tvj-style-label', text: 'Export a package' });
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'One .zip with your trade notes for the period, their Excalidraw drawings and the screenshots inside them. Send the file to whoever reviews your trading.' });
    const controls = contentEl.createDiv({ cls: 'tvj-options' });
    const period = controls.createEl('select', { cls: 'dropdown' });
    for (const [id, label] of Object.entries(EXPORT_PERIODS)) period.createEl('option', { text: label, value: id });
    period.value = this.period;
    period.addEventListener('change', () => { this.period = period.value; this.render(); });
    plugin.scopeSelect(controls, own.map((x) => x.trade), groups, this.scope, (v) => { this.scope = v; this.render(); });
    new Setting(contentEl).setName('Include drawings and screenshots').setDesc('Turn off for a small, text-only package.').addToggle((c) => c.setValue(this.withMedia).onChange((v) => { this.withMedia = v; this.render(); }));

    const dates = items.map((x) => x.trade.date).sort();
    const range = dates.length ? (dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`) : '';
    const defaultName = `${plugin.settings.profileName || 'Trader'} ${range}`.trim();
    const tiles = contentEl.createDiv({ cls: 'tvj-tiles' });
    const tile = (label, value) => {
      const el = tiles.createDiv({ cls: 'tvj-tile' });
      el.createDiv({ cls: 'tvj-tile-label', text: label });
      el.createDiv({ cls: 'tvj-sim-value', text: value });
    };
    tile('Trades', String(items.length));
    tile('Drawings', String(pack.charts));
    tile('Screenshots', String(pack.images));
    tile('Package size', fileSize(pack.bytes));
    new Setting(contentEl).setName('Package name').addText((c) => c.setPlaceholder(defaultName).setValue(this.name).onChange((v) => { this.name = v; }));
    new Setting(contentEl).addButton((b) => b.setButtonText('Export package').setCta().setDisabled(!items.length).onClick(async () => {
      b.setDisabled(true);
      const file = await plugin.exportPackage(pack, this.name.trim() || defaultName, range);
      if (file) notify(`Package saved: ${file.path}`);
      this.close();
    }));

    // ---- import ----
    contentEl.createDiv({ cls: 'tvj-style-label', text: 'Import a package' });
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'A package you import is kept apart from your own journal: it never counts in your stats, and you look at it by switching the journal at the top of any screen.' });
    const pick = contentEl.createDiv({ cls: 'tvj-options' });
    const input = pick.createEl('input', { type: 'file', attr: { accept: '.zip,application/zip' } });
    input.style.display = 'none';
    pick.createEl('button', { text: 'Choose package (.zip)' }).addEventListener('click', () => input.click());
    pick.createSpan({ cls: 'tvj-muted', text: this.incoming ? this.incoming.fileName : 'No file chosen' });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const files = await unzipFiles(await file.arrayBuffer());
        const entry = files.find((f) => /(^|\/)manifest\.json$/.test(f.name));
        if (!entry) throw new Error('no manifest');
        const manifest = JSON.parse(new TextDecoder().decode(entry.data));
        if (manifest.format !== 'truevision-journal-package') throw new Error('not a package');
        this.incoming = { fileName: file.name, files, root: entry.name.replace(/manifest\.json$/, ''), manifest };
      } catch (e) {
        this.incoming = null;
        notify('This file is not a TrueVision Journal package.');
      }
      this.render();
    });
    if (this.incoming) {
      const m = this.incoming.manifest;
      contentEl.createEl('p', { text: `${m.name} · ${m.range || ''} · ${m.trades} trades · ${m.charts} drawings · ${m.images} screenshots` });
      new Setting(contentEl).addButton((b) => b.setButtonText('Import and open').setCta().onClick(async () => {
        b.setDisabled(true);
        const folder = await plugin.importPackage(this.incoming);
        notify(`Package imported: ${m.name}`);
        this.close();
        plugin.setSource(folder);
      }));
    }

    const packages = plugin.reviewPackages();
    if (packages.length) {
      contentEl.createDiv({ cls: 'tvj-style-label', text: 'Imported packages' });
      for (const pkg of packages) {
        const row = contentEl.createDiv({ cls: 'tvj-row' });
        row.createSpan({ text: pkg.name });
        const right = row.createSpan();
        right.createEl('button', { text: 'Open' }).addEventListener('click', () => { this.close(); plugin.setSource(pkg.path); });
        right.createEl('button', { text: 'Delete' }).addEventListener('click', async () => {
          if (!ask(`Delete the imported package "${pkg.name}"? It goes to the trash.`)) return;
          await plugin.deletePackage(pkg.path);
          this.render();
        });
      }
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// The review window: a card for the trade, one question at a time with a hint under it, an optional step to tag the
// setup and mistakes, and a finish screen that offers the next trade. The questions and answers themselves come from
// LOSS_REVIEW / WIN_REVIEW and are what is written to the note.
const REVIEW_HINTS = {
  plan: 'Be honest — nobody sees this but you.',
  'why-unplanned': 'Pick the one that pulled hardest.',
  signal: 'Your full signal, not part of it.',
  'why-early': 'Naming it is how it stops.',
  stop: 'A loss taken by the rules is a good trade.',
  next: 'One concrete thing you will do differently.',
  lucky: 'Picture the next ten times you take it.',
  exit: 'Compare it with the plan you had going in.',
  repeat: 'The part you want to do again on purpose.',
};
const REVIEW_PLACEHOLDERS = {
  next: 'For example: I wait for the candle to close back inside the range before I enter.',
  repeat: 'For example: I waited for my setup and took the partial at my target.',
};
const REVIEW_OPENERS = {
  win: 'Nice trade. Two minutes to lock in what worked.',
  loss: 'Every loss is tuition. Two minutes to make sure this one pays for itself.',
  even: 'A scratch — still worth two minutes.',
};
/** The most questions left from a step (the longest path to the end of the review). */
function reviewStepsLeft(steps, id, seen = new Set()) {
  const step = steps.find((s) => s.id === id);
  if (!step || seen.has(id)) return 0;
  const nexts = step.options ? step.options.map((o) => o.next).filter(Boolean) : step.next ? [step.next] : [];
  const after = new Set([...seen, id]);
  return 1 + (nexts.length ? Math.max(...nexts.map((n) => reviewStepsLeft(steps, n, after))) : 0);
}

class ReviewModal extends ThemedModal {
  constructor(app, plugin, item) {
    super(app);
    this.plugin = plugin;
    this.item = item; // { file, trade }
    this.steps = stepsFor(netPnl(item.trade));
    this.stepId = this.steps[0].id;
    this.answers = [];
    this.history = []; // the step ids answered, so Back can undo them
    this.phase = 'questions'; // 'questions' → 'tags' → 'done'
    this.draft = '';
    this.setups = [...(item.trade.setups || [])];
    this.mistakes = [...(item.trade.mistakes || [])];
  }

  async onOpen() {
    this.modalEl.addClass('tvj-review-modal');
    this.keys = (e) => this.onKey(e);
    this.modalEl.addEventListener('keydown', this.keys);
    // your own questions (a review tree in the Logic folder) replace the built-in ones
    const own = this.plugin.ownReviewSteps ? await this.plugin.ownReviewSteps(netPnl(this.item.trade)) : null;
    if (own && own.length && !this.history.length) { this.steps = own; this.stepId = own[0].id; }
    this.render();
  }

  /** 1–9 picks an answer when the question has choices. */
  onKey(e) {
    if (this.phase !== 'questions' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    const step = this.steps.find((s) => s.id === this.stepId);
    const option = step && step.options && /^[1-9]$/.test(e.key) ? step.options[Number(e.key) - 1] : null;
    if (option) { e.preventDefault(); this.answer(step, option.label, option.next); }
  }

  header(root) {
    const t = this.item.trade;
    const pnl = netPnl(t);
    const outcome = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'even';
    const card = root.createDiv({ cls: `tvj-review-trade is-${outcome}` });
    const top = card.createDiv({ cls: 'tvj-review-top' });
    const who = top.createDiv();
    const title = who.createDiv({ cls: 'tvj-review-symbol' });
    title.createSpan({ text: t.symbol });
    title.createSpan({ cls: `tvj-review-side is-${t.direction}`, text: t.direction === 'long' ? 'Long' : 'Short' });
    who.createDiv({ cls: 'tvj-muted tvj-review-when', text: [`${t.date} · ${t.time}`, t.account].filter(Boolean).join(' · ') });
    top.createDiv({ cls: `tvj-review-pnl ${pnl > 0 ? 'tvj-pos' : pnl < 0 ? 'tvj-neg' : ''}`, text: `${pnl > 0 ? '+' : ''}${money(Math.round(pnl * 100) / 100)}` });
    const chips = card.createDiv({ cls: 'tvj-review-chips' });
    const chip = (label, value) => {
      const c = chips.createDiv({ cls: 'tvj-review-chip' });
      c.createSpan({ cls: 'tvj-muted', text: label });
      c.createSpan({ text: value });
    };
    const price = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 5 });
    const r = rMultiple(t);
    if (r !== null) chip('R', `${r >= 0 ? '+' : ''}${r.toFixed(2)}`);
    if (!t.pnlOnly) chip('Size', `${t.qty}${t.market === 'cfd' ? ' lot' : ''}`);
    if (t.entry || t.exit) chip('Entry → exit', `${price(t.entry)} → ${price(t.exit)}`);
    if ((t.entries || []).length > 1) chip('Pyramid', `${t.entries.length} entries`);
    if ((t.exits || []).length > 1) chip('Partial exits', `${t.exits.length} exits`);
    if (t.duration > 0) chip('Held', shortDuration(t.duration));
    if ((t.setups || []).length) chip(t.setups.length > 1 ? 'Setups' : 'Setup', t.setups.join(', '));
    card.createEl('p', { cls: 'tvj-review-opener', text: REVIEW_OPENERS[outcome] });
  }

  progress(root) {
    const left = this.phase === 'questions' ? reviewStepsLeft(this.steps, this.stepId) : 0;
    const total = this.answers.length + left + 1; // + the tagging step
    const done = this.phase === 'tags' ? total - 1 : this.answers.length;
    root.createDiv({ cls: 'tvj-review-progress' }).createDiv({ cls: 'tvj-review-progress-fill' }).style.width = `${Math.round((done / total) * 100)}%`;
    root.createDiv({ cls: 'tvj-muted tvj-review-count', text: this.phase === 'tags' ? tx('Last step · optional') : `${tx('Question')} ${this.answers.length + 1} / ${this.answers.length + left}` });
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.phase === 'done') { this.renderDone(); return; }
    accentTitle(contentEl, 'h2', 'Trade review');
    this.header(contentEl);
    this.progress(contentEl);
    if (this.answers.length) {
      const trail = contentEl.createDiv({ cls: 'tvj-review-trail' });
      for (const a of this.answers) trail.createSpan({ cls: 'tvj-review-crumb', text: a.answer, attr: { title: a.question } });
    }
    if (this.phase === 'tags') { this.renderTags(); return; }
    const step = this.steps.find((s) => s.id === this.stepId);
    if (!step) return;
    const box = contentEl.createDiv({ cls: 'tvj-review-question' });
    box.createDiv({ cls: 'tvj-review-ask', text: step.question });
    if (REVIEW_HINTS[step.id]) box.createDiv({ cls: 'tvj-muted tvj-review-hint', text: REVIEW_HINTS[step.id] });
    if (step.options) {
      const grid = box.createDiv({ cls: 'tvj-review-options' });
      step.options.forEach((o, i) => {
        const b = grid.createEl('button', { cls: 'tvj-review-option' });
        b.createSpan({ cls: 'tvj-review-key', text: String(i + 1) });
        b.createSpan({ text: o.label });
        b.addEventListener('click', () => this.answer(step, o.label, o.next));
      });
    } else {
      const area = box.createEl('textarea', { cls: 'tvj-textarea tvj-review-text', attr: { rows: '4', placeholder: tx(REVIEW_PLACEHOLDERS[step.id] || 'Write it the way you would say it to yourself.') } });
      area.value = this.draft;
      const row = box.createDiv({ cls: 'tvj-review-actions' });
      row.createSpan({ cls: 'tvj-muted tvj-review-hint', text: '⌘ / Ctrl + Enter' });
      const go = row.createEl('button', { cls: 'mod-cta', text: 'Continue' });
      go.disabled = !area.value.trim();
      const submit = () => { if (area.value.trim()) this.answer(step, area.value.trim(), step.next); };
      area.addEventListener('input', () => { this.draft = area.value; go.disabled = !area.value.trim(); });
      area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } });
      go.addEventListener('click', submit);
      window.setTimeout(() => area.focus(), 0);
    }
    this.backButton(contentEl);
  }

  backButton(root) {
    if (!this.history.length) return;
    root.createEl('button', { cls: 'tvj-review-back', text: '← Back' }).addEventListener('click', () => this.back());
  }

  back() {
    const last = this.history.pop();
    const answer = this.answers.pop();
    this.phase = 'questions';
    this.stepId = last;
    const step = this.steps.find((s) => s.id === last);
    this.draft = step && !step.options && answer ? answer.answer : '';
    this.render();
  }

  answer(step, value, next) {
    this.answers.push({ question: tx(step.question), answer: tx(value) }); // written to the note in the chosen language
    this.history.push(step.id);
    this.draft = '';
    if (next) this.stepId = next;
    else this.phase = 'tags';
    this.render();
  }

  renderTags() {
    const box = this.contentEl.createDiv({ cls: 'tvj-review-question' });
    box.createDiv({ cls: 'tvj-review-ask', text: 'Tag this trade' });
    box.createDiv({ cls: 'tvj-muted tvj-review-hint', text: 'Optional — it is what makes your stats per setup and per mistake worth reading.' });
    const all = this.plugin.getTrades().map((x) => x.trade);
    // the ready-made tags first, in their own order, then the others your trades already use
    const known = (picked, key) => uniqueTags([...presetTags(this.plugin.settings, key), ...[...all.flatMap((t) => t[key] || []), ...picked].sort((a, b) => a.localeCompare(b))]);
    const typed = []; // names typed into "+ New" but not yet added with Enter; Finish adds them too
    // Both groups take as many as fit; a new name is added and ticked (an existing one, in any case, is just ticked).
    const group = (label, key, values) => {
      box.createDiv({ cls: 'tvj-card-title tvj-review-label', text: label });
      const wrap = box.createDiv({ cls: 'tvj-review-tags' });
      for (const v of values) {
        wrap.createEl('button', { cls: `tvj-review-tag ${this[key].includes(v) ? 'is-on' : ''}`, text: v }).addEventListener('click', () => {
          this[key] = this[key].includes(v) ? this[key].filter((x) => x !== v) : [...this[key], v];
          this.render();
        });
      }
      const input = wrap.createEl('input', { type: 'text', cls: 'tvj-review-newtag', attr: { placeholder: tx('+ New') } });
      const add = () => {
        const name = input.value.trim();
        if (!name) return false;
        const same = values.find((v) => v.toLowerCase() === name.toLowerCase()) || name;
        if (!this[key].includes(same)) this[key] = [...this[key], same];
        return true;
      };
      typed.push(add);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add()) { e.preventDefault(); this.render(); } });
    };
    group('Setups', 'setups', known(this.setups, 'setups'));
    group('Mistakes', 'mistakes', known(this.mistakes, 'mistakes'));
    const row = box.createDiv({ cls: 'tvj-review-actions' });
    row.createEl('button', { text: 'Skip' }).addEventListener('click', () => this.finish(false));
    row.createEl('button', { cls: 'mod-cta', text: 'Finish review' }).addEventListener('click', () => { typed.forEach((add) => add()); this.finish(true); });
    this.backButton(this.contentEl);
  }

  async finish(withTags) {
    await this.plugin.saveReview(this.item.file, this.answers);
    const t = this.item.trade;
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    if (withTags && this.item.file instanceof TFile && (!same(t.setups || [], this.setups) || !same(t.mistakes || [], this.mistakes))) {
      await this.app.fileManager.processFrontMatter(this.item.file, (fm) => { fm.setups = this.setups; delete fm.setup; fm.mistakes = this.mistakes; });
    }
    this.phase = 'done';
    this.render();
  }

  renderDone() {
    const box = this.contentEl.createDiv({ cls: 'tvj-review-done' });
    box.createDiv({ cls: 'tvj-review-check', text: '✓' });
    box.createDiv({ cls: 'tvj-review-ask', text: 'Trade reviewed' });
    const pending = this.plugin.getTrades(null, true).filter((x) => !x.trade.reviewed && x.file !== this.item.file).sort((a, b) => byTime(b.trade, a.trade));
    box.createDiv({ cls: 'tvj-muted tvj-review-hint', text: pending.length ? `${pending.length} ${tx(pending.length === 1 ? 'trade left to review.' : 'trades left to review.')}` : tx('Every trade is reviewed — that is the habit.') });
    const row = box.createDiv({ cls: 'tvj-review-actions is-center' });
    row.createEl('button', { text: 'Done' }).addEventListener('click', () => this.close());
    if (pending.length) {
      const next = row.createEl('button', { cls: 'mod-cta', text: 'Review the next trade' });
      next.addEventListener('click', () => { this.close(); new ReviewModal(this.app, this.plugin, pending[0]).open(); });
      window.setTimeout(() => next.focus(), 0);
    }
  }

  onClose() {
    if (this.keys) this.modalEl.removeEventListener('keydown', this.keys);
    this.contentEl.empty();
  }
}

class PendingTradeSuggest extends FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder('Pick a trade to review…');
  }
  getItems() {
    return this.plugin.getTrades(null, true).filter((x) => !x.trade.reviewed).sort((a, b) => byTime(b.trade, a.trade));
  }
  getItemText(x) {
    const t = x.trade;
    return `${t.date} ${t.time} · ${t.symbol} ${t.direction} · ${money(netPnl(t))}`;
  }
  onChooseItem(x) {
    new ReviewModal(this.app, this.plugin, x).open();
  }
}

class AddAccountModal extends ThemedModal {
  constructor(app, plugin, onAdded) {
    super(app);
    this.plugin = plugin;
    this.onAdded = onAdded;
    this.name = '';
    this.group = '';
    this.start = '';
    this.price = '';
    this.firmName = ''; // '' no rules (a personal account), '__custom' another firm's rules typed in next, or a firm of the list
    this.challengeId = '';
    this.step = 0;
    this.demo = false; // a practice or contest account: left out of the All-accounts totals
    this.view = 'firms'; // firms (pick one) → plans (its plans and sizes) → form (name, group, price)
    this.plan = '';
    this.unit = '$'; // the plan cards' amounts in dollars or as a % of the account size
    this.showFunded = new Set(); // the cards turned over to their funded step
    this.pathOf = {}; // per card: which funded path its funded side shows (an index into fundedPaths)
  }

  async onOpen() {
    await this.plugin.loadChallengeCatalog();
    this.render();
  }

  /** The picked challenge step: { firm, challenge, step, rules } or null. */
  picked() {
    const found = this.challengeId ? catalogChallenge(this.plugin.challengeCatalog || { firms: [] }, this.challengeId) : null;
    if (!found) return null;
    const step = Math.max(0, Math.min(found.challenge.steps.length - 1, this.step));
    return { ...found, step, rules: rulesFromStep(found.firm, found.challenge, step) };
  }

  /** Redraws in place: nothing slides in again, only a card just turned over flips. */
  render() {
    this.still = true;
    this.keepScroll(() => this.draw());
    this.still = false;
    this.flipped = '';
  }

  /** Moves to another view, which slides in. */
  go(view) {
    this.view = view;
    this.contentEl.scrollTop = 0;
    this.modalEl.scrollTop = 0;
    this.draw();
  }

  draw() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('tvj-firm-modal');
    const catalog = this.plugin.challengeCatalog || { firms: [] };
    const firm = catalog.firms.find((f) => f.name === this.firmName);
    const view = contentEl.createDiv({ cls: `tvj-firm-view is-${this.view}${this.still ? ' is-still' : ''}` });
    if (this.view === 'plans' && firm) this.drawPlans(view, firm);
    else if (this.view === 'form') this.drawForm(view, firm);
    else this.drawFirms(view, catalog);
  }

  /** A firm's mark: its initials on a tint of its own. */
  mark(parent, name, big) {
    const words = String(name).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
    let hue = 0;
    for (const ch of String(name)) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    const logo = FIRM_LOGOS[name];
    const el = parent.createDiv({ cls: `tvj-firm-mark${big ? ' is-big' : ''}${logo ? ' has-logo' : ''}`, text: logo ? '' : initials });
    el.style.setProperty('--tvj-firm-hue', String(hue));
    if (logo) el.createEl('img', { attr: { src: logo, alt: '' } });
    return el;
  }

  /** The first view: every firm on the list as a tile, then a personal account or another firm's rules. */
  drawFirms(view, catalog) {
    accentTitle(view, 'h2', 'Add account');
    view.createEl('p', { cls: 'tvj-muted', text: 'Pick your prop firm: its rules come with the account. Or add a personal account below.' });
    const search = view.createEl('input', { type: 'search', cls: 'tvj-firm-search', attr: { placeholder: 'Search firms', 'aria-label': 'Search firms' } });
    const grid = view.createDiv({ cls: 'tvj-firm-grid' });
    const tiles = [];
    for (const f of catalog.firms) {
      const tile = grid.createEl('button', { cls: 'tvj-firm-tile' });
      this.mark(tile, f.name);
      const words = tile.createDiv({ cls: 'tvj-firm-tile-text' });
      words.createDiv({ cls: 'tvj-firm-name', text: f.name });
      words.createDiv({ cls: 'tvj-muted', text: firmSummary(f) });
      tile.createSpan({ cls: 'tvj-firm-go', text: '›' });
      tile.addEventListener('click', () => {
        this.firmName = f.name;
        const plans = firmPlans(f);
        if (!plans.some((x) => x.name === this.plan)) this.plan = plans.length ? plans[0].name : '';
        this.go('plans');
      });
      tiles.push([f.name.toLowerCase(), tile]);
    }
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const [name, tile] of tiles) tile.style.display = !q || name.includes(q) ? '' : 'none';
    });
    if (!this.name) window.setTimeout(() => search.focus(), 0);
    view.createDiv({ cls: 'tvj-firm-or', text: 'or' });
    const others = view.createDiv({ cls: 'tvj-firm-others' });
    for (const [key, title, sub] of [['', 'Personal account', 'No prop firm rules'], ['__custom', 'Another firm', 'Type its rules after adding it']]) {
      const tile = others.createEl('button', { cls: 'tvj-firm-tile is-plain' });
      const words = tile.createDiv({ cls: 'tvj-firm-tile-text' });
      words.createDiv({ cls: 'tvj-firm-name', text: title });
      words.createDiv({ cls: 'tvj-muted', text: sub });
      tile.createSpan({ cls: 'tvj-firm-go', text: '›' });
      tile.addEventListener('click', () => { this.firmName = key; this.challengeId = ''; this.step = 0; this.go('form'); });
    }
  }

  /** A firm's plans: a tab per plan, and a card per account size with its rules and where to start logging it. */
  drawPlans(view, firm) {
    const head = view.createDiv({ cls: 'tvj-firm-head' });
    head.createEl('button', { cls: 'tvj-firm-back', text: '←', attr: { 'aria-label': 'Back' } }).addEventListener('click', () => this.go('firms'));
    this.mark(head, firm.name, true);
    const title = head.createDiv({ cls: 'tvj-firm-title' });
    title.createDiv({ cls: 'tvj-firm-name', text: firm.name });
    if (firm.verified) {
      const age = daysBetween(firm.verified, isoDay(new Date()));
      title.createDiv({ cls: `tvj-rules-checked${age > 31 ? ' is-old' : ''}`, text: LANG === 'vi' ? `Luật được kiểm tra ngày ${firm.verified}${age > 31 ? ' · đã hơn một tháng' : ''}` : `Rules checked ${firm.verified}${age > 31 ? ' · over a month ago' : ''}` });
    }
    const units = head.createDiv({ cls: 'tvj-seg' });
    for (const u of ['$', '%']) {
      units.createEl('button', { text: u, cls: this.unit === u ? 'is-active' : '', attr: { 'aria-label': u === '$' ? 'Show dollars' : 'Show % of the account' } }).addEventListener('click', () => { this.unit = u; this.render(); });
    }

    // a tab per product (LucidPro, Trading Combine); its options (DLL On / Off, EOD or intraday) as a switch under it
    const plans = firmPlans(firm);
    const plan = plans.find((x) => x.name === this.plan) || plans[0];
    if (!plan) { view.createEl('p', { cls: 'tvj-muted', text: 'This firm has no plans on the list.' }); return; }
    const family = (x) => x.name.split(' · ')[0];
    const option = (x) => x.name.split(' · ').slice(1).join(' · ') || 'Standard';
    const families = [...new Set(plans.map(family))];
    const pickPlan = (x) => { this.plan = x.name; this.render(); };
    if (families.length > 1) {
      const tabs = view.createDiv({ cls: 'tvj-plan-tabs' });
      for (const name of families) {
        const first = plans.find((x) => family(x) === name);
        const evals = first.challenges[0].steps.filter((st) => st.stage === 'evaluation').length;
        const paths = fundedPaths(firm, first.challenges[0]).length;
        const sub = evals ? (evals === 1 ? '1-step evaluation' : `${evals}-step evaluation`) : 'Straight to funded';
        const tab = tabs.createEl('button', { cls: `tvj-plan-tab${name === family(plan) ? ' is-active' : ''}` });
        tab.createDiv({ cls: 'tvj-plan-tab-name', text: name });
        tab.createDiv({ cls: 'tvj-plan-tab-sub', text: paths > 1 ? `${tx(sub)} · ${paths} ${tx('funded paths')}` : sub });
        // a product keeps the option picked before (DLL Off stays DLL Off) when it has it
        tab.addEventListener('click', () => pickPlan(plans.find((x) => family(x) === name && option(x) === option(plan)) || first));
      }
    }
    const options = plans.filter((x) => family(x) === family(plan));
    if (options.length > 1) {
      const seg = view.createDiv({ cls: 'tvj-plan-options' }).createDiv({ cls: 'tvj-seg' });
      for (const x of options) seg.createEl('button', { text: option(x), cls: x === plan ? 'is-active' : '' }).addEventListener('click', () => pickPlan(x));
    }

    const cards = view.createDiv({ cls: 'tvj-plan-cards' });
    for (const ch of plan.challenges) this.drawPlanCard(cards, firm, ch);
    view.createEl('p', { cls: 'tvj-muted tvj-plan-foot', text: PLAN_PRICES.firms[firm.name]
      ? (LANG === 'vi' ? `Giá niêm yết kiểm tra ngày ${PLAN_PRICES.checked}, chưa trừ mã giảm giá. Luật có thể đổi; hãy đối chiếu với dashboard của quỹ.` : `List prices checked ${PLAN_PRICES.checked}, before discount codes. Rules change; check them against your firm's dashboard.`)
      : "Rules change; check them against your firm's dashboard. The account's overview has them to adjust." });
  }

  /** One account size: the balance line from fail to target, its rules, and Log eval / Log funded. */
  drawPlanCard(parent, firm, base) {
    // the funded side shows the funded path picked on it (Topstep: Standard or Consistency)
    const paths = fundedPaths(firm, base);
    const path = paths[Math.min(this.pathOf[base.id] || 0, paths.length - 1)];
    const funded = fundedStep(base);
    const turned = this.showFunded.has(base.id) && funded >= 0;
    const ch = turned ? path.challenge : base;
    const index = turned ? funded : 0;
    const step = ch.steps[index];
    const r = step.rules || {};
    const start = Number(step.start) || 0;
    const size = ch.size || start || 1;
    const amount = (n) => (this.unit === '%' ? `${Math.round((n / size) * 1000) / 10}%` : money(n));
    const card = parent.createDiv({ cls: `tvj-plan-card${turned ? ' is-funded' : ''}${this.flipped === base.id ? ' is-flipping' : ''}` });
    const top = card.createDiv({ cls: 'tvj-plan-card-top' });
    top.createDiv({ cls: 'tvj-tile-label', text: 'Account size' });
    top.createDiv({ cls: `tvj-plan-stage${step.stage === 'evaluation' ? '' : ' is-funded'}`, text: tx(STAGE_LABELS[step.stage] || step.stage) });
    card.createDiv({ cls: 'tvj-plan-size', text: sizeLabel(ch.size) });
    card.createDiv({ cls: 'tvj-muted tvj-plan-name', text: ch.steps.length > 1 && !planName(ch).includes(step.name) && step.name.toLowerCase() !== String(STAGE_LABELS[step.stage] || '').toLowerCase() && step.name !== 'Evaluation' ? `${planName(ch)} · ${step.name}` : planName(ch) });

    if (turned && paths.length > 1) {
      const seg = card.createDiv({ cls: 'tvj-seg tvj-plan-path', attr: { 'aria-label': 'Funded path' } });
      paths.forEach((x, i) => seg.createEl('button', { text: x.name, cls: x === path ? 'is-active' : '' }).addEventListener('click', () => { this.pathOf[base.id] = i; this.render(); }));
    }
    // the balance line: where the account fails, where it starts and where it passes
    const maxLoss = positive(r.maxLoss), target = positive(r.target);
    // a funded step has no target: the line runs to the balance its first payout needs (the buffer to build)
    const payoutAt = step.stage === 'evaluation' ? null : firstPayoutBalance(step);
    const goal = target ? start + target : payoutAt !== null && payoutAt > start ? payoutAt : null;
    if (maxLoss || goal !== null) {
      const low = start - (maxLoss || 0), high = goal === null ? start : goal;
      const at = high > low ? ((start - low) / (high - low)) * 100 : 0;
      const bar = card.createDiv({ cls: 'tvj-plan-bar' });
      bar.createDiv({ cls: 'tvj-plan-bar-loss' }).style.width = `${at}%`;
      bar.createDiv({ cls: 'tvj-plan-bar-gain' }).style.width = `${100 - at}%`;
      const dot = bar.createDiv({ cls: 'tvj-plan-bar-dot' });
      dot.style.left = `${at}%`;
      const marks = card.createDiv({ cls: 'tvj-plan-marks' });
      for (const [value, label, show] of [[low, 'Fail below', !!maxLoss], [start, 'Start', true], [high, target ? 'Target' : 'First payout', goal !== null]]) {
        const m = marks.createDiv({ cls: show ? '' : 'is-empty' });
        m.createDiv({ cls: 'tvj-plan-mark-value', text: show ? money(value) : '' });
        m.createDiv({ cls: 'tvj-muted', text: show ? label : '' });
      }
    }

    const rows = card.createDiv({ cls: 'tvj-plan-rows' });
    const row = (label, value, note) => {
      const line = rows.createDiv({ cls: 'tvj-plan-row' });
      line.createSpan({ cls: 'tvj-muted', text: label });
      const v = line.createSpan({ cls: 'tvj-plan-row-value', text: value });
      if (note) v.createSpan({ cls: 'tvj-plan-row-note', text: ` ${note}` });
    };
    const DD = { static: 'Static', eod: 'EOD trailing', intraday: 'Intraday trailing' };
    const minis = positive(r.maxContracts) || positive(r.initialContracts);
    const micros = positive(r.microsPerContract) || 10;
    if (step.stage === 'evaluation' || target) row('Profit target', target ? amount(target) : '—');
    else row('Buffer to first payout', payoutAt !== null && payoutAt > start ? amount(payoutAt - start) : payoutAt !== null ? tx('None') : '—');
    row('Max loss', maxLoss ? amount(maxLoss) : '—', maxLoss && DD[r.drawdown] ? tx(DD[r.drawdown]) : '');
    row('Daily loss', positive(r.dailyLoss) ? amount(r.dailyLoss) : tx('None'), positive(r.dailyLoss) && r.dailyHard === false ? tx('pauses the day') : '');
    row('Contracts', minis ? `${minis} ${tx('minis')} / ${minis * micros} ${tx('micros')}` : '—');
    row('Min days', positive(r.minDays) ? String(r.minDays) : '—');
    row('Consistency', positive(r.consistency) ? `${r.consistency}%` : '—');
    // what it costs: the plan's list price, and on the funded side the activation fee
    const price = planPrice(firm.name, base);
    if (!PLAN_PRICES.firms[firm.name]) { /* no prices for this firm: no price row */ }
    else if (!turned || index === 0) row('List price', price ? priceText(price) : '—', price && price.activation && !turned ? `+ ${money(price.activation)} ${tx('activation')}` : '');
    else row('Activation fee', price && price.activation ? money(price.activation) : price ? tx('None') : '—');

    const actions = card.createDiv({ cls: 'tvj-plan-actions' });
    if (funded > 0) {
      actions.createEl('button', { cls: 'tvj-plan-flip', text: turned ? '↺ Evaluation' : '↺ Funded details' }).addEventListener('click', () => {
        if (turned) this.showFunded.delete(base.id); else this.showFunded.add(base.id);
        this.flipped = base.id;
        this.render();
      });
    }
    const log = actions.createDiv({ cls: 'tvj-plan-log' });
    // an evaluation is logged on the plan itself (its funded path is chosen when it is passed); funded on the path shown
    const pick = (i) => {
      const picked = i === 0 ? base : path.challenge;
      this.challengeId = picked.id;
      this.step = i;
      this.start = String(picked.steps[i].start);
      const price = planPrice(firm.name, base);
      if (price && price.currency === 'USD' && (i === 0 || base.steps[0].stage !== 'evaluation') && !String(this.price).trim()) this.price = String(price.amount);
      if (!this.name.trim()) {
        const stem = `${firm.name} ${sizeLabel(base.size)}`;
        const taken = new Set(this.plugin.settings.accounts || []);
        let n = 1;
        while (taken.has(`${stem} #${n}`)) n++;
        this.name = `${stem} #${n}`;
      }
      this.go('form');
    };
    if (base.steps[0].stage === 'evaluation') log.createEl('button', { text: 'Log eval', cls: 'mod-cta' }).addEventListener('click', () => pick(0));
    if (funded >= 0) log.createEl('button', { text: 'Log funded' }).addEventListener('click', () => pick(funded));
  }

  /** The last view: what you picked, then the account's name, group, demo switch, balance and price. */
  drawForm(view, firm) {
    const head = view.createDiv({ cls: 'tvj-firm-head' });
    head.createEl('button', { cls: 'tvj-firm-back', text: '←', attr: { 'aria-label': 'Back' } }).addEventListener('click', () => this.go(firm ? 'plans' : 'firms'));
    accentTitle(head, 'h2', 'Add account');
    const got = this.picked();
    if (firm && got) {
      const chosen = view.createDiv({ cls: 'tvj-firm-chosen' });
      this.mark(chosen, firm.name);
      const words = chosen.createDiv({ cls: 'tvj-firm-tile-text' });
      words.createDiv({ cls: 'tvj-firm-name', text: `${firm.name} · ${got.challenge.name}` });
      words.createDiv({ cls: 'tvj-muted tvj-add-rules', text: rulesSummary(got.rules) });
      chosen.createDiv({ cls: `tvj-plan-stage${got.challenge.steps[got.step].stage === 'evaluation' ? '' : ' is-funded'}`, text: tx(STAGE_LABELS[got.challenge.steps[got.step].stage] || '') });
    } else if (this.firmName === '__custom') {
      view.createEl('p', { cls: 'tvj-muted', text: 'After you add the account, the rules window opens to type them in.' });
    } else {
      view.createEl('p', { cls: 'tvj-muted', text: 'A personal account: no prop firm rules.' });
    }
    new Setting(view).setName('Account name').setDesc('For example: Combine 50K #1, Funded 100K.').addText((c) => {
      c.setPlaceholder('Combine 50K #1').setValue(this.name).onChange((v) => { this.name = v; });
      c.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.save(); });
      window.setTimeout(() => { c.inputEl.focus(); c.inputEl.select(); }, 0);
    });
    new Setting(view).setName('Demo account').setDesc('A practice or contest account: its trades and costs stay out of every All-accounts total and the challenge tracker.')
      .addToggle((c) => c.setValue(this.demo).onChange((v) => { this.demo = v; }));
    const groups = parseGroups(this.plugin.settings.groups);
    new Setting(view).setName('Group').setDesc('Optional: put the account in a group, existing or new.').addText((c) => {
      c.setPlaceholder(groups.length ? groups.map((g) => g.name).join(', ') : 'Combines').setValue(this.group).onChange((v) => { this.group = v; });
    });
    new Setting(view).setName('Starting balance ($)').setDesc(got ? 'Filled in from the challenge.' : 'Optional: used for the account balance.').addText((c) => c.setPlaceholder('50000').setValue(this.start).onChange((v) => { this.start = v; }));
    new Setting(view).setName('Evaluation price ($)').setDesc('Optional: what you paid for it. It counts in the challenge tracker, where activation fees and resets can be added later.')
      .addText((c) => c.setPlaceholder('150').setValue(this.price).onChange((v) => { this.price = v; }));
    new Setting(view).addButton((b) => b.setButtonText('Add account').setCta().onClick(() => this.save()));
  }

  async save() {
    const name = this.name.trim();
    if (!name) {
      notify('Type an account name.');
      return;
    }
    if (/[,:\n]/.test(name)) {
      notify('Account names cannot contain commas or colons.');
      return;
    }
    const start = Number(String(this.start).replace(/[$,\s]/g, ''));
    const info = {};
    if (String(this.start).trim() !== '' && Number.isFinite(start)) info.start = start;
    const got = this.picked();
    if (got && this.firmName && this.firmName !== '__custom') { info.rules = got.rules; info.kind = stageKind(got.challenge.steps[got.step].stage); }
    if (this.demo) info.kind = 'demo';
    if (Object.keys(info).length) this.plugin.settings.accountInfo[name] = info;
    await this.plugin.addAccount(name, this.group.trim());
    const price = Math.round(Number(String(this.price || '').replace(/[$,\s]/g, '')) * 100) / 100;
    if (Number.isFinite(price) && price > 0) await this.plugin.saveCost({ date: isoDay(new Date()), account: name, firm: got ? got.firm.name : '', kind: 'eval', amount: price, note: '' });
    notify(`Account added: ${name}`);
    this.close();
    if (this.firmName === '__custom') new ChallengeRulesModal(this.app, this.plugin, name, this.onAdded).open();
    if (this.onAdded) this.onAdded(name);
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Starting balance per account: what Balance on the lobby and dashboard is measured from. */
class BalancesModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Accounts: balance and status');
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'Balance = starting balance + net P&L of the trades on that account − payouts. Leave empty for accounts you do not want counted.' });
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'Max loss is optional: when the trades take an account that far below its starting balance, it is marked as blown by itself. You can also mark an account as blown by hand. A blown account keeps its trades in your statistics, but its balance stops counting.' });
    const info = this.plugin.settings.accountInfo;
    const trades = this.plugin.getTrades().map((x) => x.trade);
    const accounts = this.plugin.allAccounts(trades).filter((a) => a !== NO_ACCOUNT);
    if (!accounts.length) contentEl.createEl('p', { text: 'No accounts yet — add one with "+ Account".' });
    const amount = (v) => {
      const n = Number(String(v).replace(/[$,\s]/g, ''));
      return String(v).trim() === '' || !Number.isFinite(n) ? null : n;
    };
    const put = async (a, key, value) => {
      const next = { ...(info[a] || {}) };
      if (value === null || value === '' || value === false) delete next[key];
      else next[key] = value;
      if (Object.keys(next).length) info[a] = next;
      else delete info[a];
      await this.plugin.saveData(this.plugin.settings);
    };
    for (const a of accounts) {
      const status = accountStatus(a, trades, info);
      const row = new Setting(contentEl).setName(a);
      row.settingEl.classList.add('tvj-account-row');
      const describe = () => {
        const st = accountStatus(a, trades, info);
        const ch = challengeStatus(a, trades, info);
        const reason = ch && ch.reason ? ch.reason : 'hit the max loss';
        row.setDesc(st.blown ? (st.auto ? `Blown on ${st.blownOn} — ${reason}` : `Blown on ${st.blownOn}`) : st.passed ? `Passed on ${st.passed}` : st.room === null ? 'Active' : `Active · ${money(Math.round(st.room))} left before the max loss`);
        row.settingEl.classList.toggle('tvj-is-blown', st.blown);
      };
      row.addText((c) => c.setPlaceholder('Start 50000').setValue(info[a] && Number.isFinite(Number(info[a].start)) ? String(info[a].start) : '').onChange(async (v) => { await put(a, 'start', amount(v)); describe(); }));
      if (info[a] && info[a].rules) row.controlEl.createSpan({ cls: 'tvj-muted tvj-nowrap', text: [info[a].rules.firm, info[a].rules.stepName].filter(Boolean).join(' · ') || 'Challenge set' });
      else row.addText((c) => c.setPlaceholder('Max loss 2000').setValue(status.maxLoss === null ? '' : String(status.maxLoss)).onChange(async (v) => { await put(a, 'maxLoss', amount(v)); describe(); }));
      row.addButton((b) => b.setButtonText('Rules').onClick(() => new ChallengeRulesModal(this.app, this.plugin, a, () => this.onOpen()).open()));
      // the switch shows the hand-set mark only; an account blown by its max loss says so in the line under its name
      row.addDropdown((d) => {
        d.addOption('eval', 'Eval');
        d.addOption('funded', 'Funded');
        d.addOption('demo', 'Demo');
        d.setValue(accountKind(a, info)).onChange(async (v) => { await put(a, 'kind', v); });
      });
      row.controlEl.createSpan({ cls: 'tvj-muted tvj-nowrap', text: 'Blown' });
      row.addToggle((c) => c.setValue(!!(info[a] && info[a].blown)).onChange(async (v) => { await put(a, 'blown', v ? isoDay(new Date()) : null); describe(); }));
      row.addButton((b) => b.setButtonText('Delete').onClick(() => {
        new DeleteAccountModal(this.app, this.plugin, a, () => this.onOpen()).open();
      }));
      describe();
    }
    new Setting(contentEl).addButton((b) => b.setButtonText('Done').setCta().onClick(() => this.close()));
  }
  onClose() {
    this.contentEl.empty();
    this.plugin.refreshViews();
  }
}

/** The challenge of one account: firm → challenge → current step from the catalog (or Custom); every number editable. */
class ChallengeRulesModal extends ThemedModal {
  constructor(app, plugin, account, onDone) {
    super(app);
    this.plugin = plugin;
    this.account = account;
    this.onDone = onDone;
    const info = plugin.settings.accountInfo[account] || {};
    this.rules = info.rules ? { ...info.rules } : { drawdown: 'static', dailyHard: false };
    this.start = info.start !== undefined ? String(info.start) : '';
    this.kind = accountKind(account, plugin.settings.accountInfo);
    this.firmName = this.rules.firm || '';
  }
  async onOpen() {
    await this.plugin.loadChallengeCatalog();
    this.render();
  }
  catalog() { return this.plugin.challengeCatalog || { firms: [] }; }
  pick(firmName, challengeId, step) {
    const found = catalogChallenge(this.catalog(), challengeId);
    if (!found) return;
    const index = Math.max(0, Math.min(found.challenge.steps.length - 1, Number(step) || 0));
    this.rules = rulesFromStep(found.firm, found.challenge, index);
    this.start = String(found.challenge.steps[index].start);
    this.kind = stageKind(found.challenge.steps[index].stage);
    this.firmName = firmName;
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', `Challenge · ${this.account}`);
    const catalog = this.catalog();
    const r = this.rules;
    const num = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(/[$,%\s]/g, '')));
    contentEl.createEl('p', { cls: 'tvj-muted', text: "Rules change; check them against your firm's dashboard." });

    new Setting(contentEl).setName('Firm').addDropdown((d) => {
      d.addOption('', tx('Custom'));
      for (const f of catalog.firms) d.addOption(f.name, f.name);
      d.setValue(catalog.firms.some((f) => f.name === this.firmName) ? this.firmName : '').onChange((v) => {
        this.firmName = v;
        const firm = catalog.firms.find((f) => f.name === v);
        if (firm && firm.challenges.length) this.pick(v, firm.challenges[0].id, 0);
        else this.rules = { drawdown: this.rules.drawdown || 'static', dailyHard: false };
        this.render();
      });
    });
    const firm = catalog.firms.find((f) => f.name === this.firmName);
    const found = r.challengeId ? catalogChallenge(catalog, r.challengeId) : null;
    if (firm) {
      new Setting(contentEl).setName('Challenge').addDropdown((d) => {
        for (const ch of firm.challenges) d.addOption(ch.id, ch.name);
        d.setValue(found ? r.challengeId : firm.challenges[0].id).onChange((v) => { this.pick(firm.name, v, 0); this.render(); });
      });
      if (found) {
        new Setting(contentEl).setName('Current step').setDesc(found.challenge.steps.map((s, i) => (i === r.step ? `[${s.name}]` : s.name)).join('  →  '))
          .addDropdown((d) => {
            found.challenge.steps.forEach((s, i) => d.addOption(String(i), `${i + 1}. ${s.name} · ${tx(STAGE_LABELS[s.stage] || s.stage)}`));
            d.setValue(String(r.step || 0)).onChange((v) => { this.pick(firm.name, r.challengeId, Number(v)); this.render(); });
          });
        if (found.challenge.notes) contentEl.createEl('p', { cls: 'tvj-muted tvj-challenge-notes', text: found.challenge.notes });
      }
    } else {
      new Setting(contentEl).setName('Firm name').addText((c) => c.setPlaceholder('Legends Trading').setValue(r.firm || '').onChange((v) => { r.firm = v; }));
      new Setting(contentEl).setName('Step').addText((c) => c.setPlaceholder('Evaluation, Funded …').setValue(r.stepName || '').onChange((v) => { r.stepName = v; }));
    }
    new Setting(contentEl).setName('Starting balance ($)').addText((c) => c.setValue(this.start).onChange((v) => { this.start = v; }));
    // the practical side: trading around the news, and how long it can go without a trade (empty = the firm's, when known)
    const known = practicalRules({ firm: r.firm, stage: r.stage });
    new Setting(contentEl).setName('Trading around high-impact news').setDesc(known.newsRule ? `${tx('From the firm')}: ${tx(NEWS_RULES[known.newsRule])}${known.newsMinutes ? ` (±${known.newsMinutes} min)` : ''}` : 'Saving a trade warns you when a release falls inside the window.')
      .addDropdown((d) => {
        d.addOption('', known.newsRule ? tx('As the firm says') : tx('Not set'));
        for (const [k, label] of Object.entries(NEWS_RULES)) d.addOption(k, tx(label));
        d.setValue(r.newsRule || '').onChange((v) => { r.newsRule = v || undefined; this.render(); });
      });
    if ((r.newsRule || known.newsRule) && (r.newsRule || known.newsRule) !== 'allowed') {
      new Setting(contentEl).setName('Minutes either side of the release').addText((c) => c.setPlaceholder(String(known.newsMinutes || 5)).setValue(fieldText(r.newsMinutes ?? '')).onChange((v) => { r.newsMinutes = num(v); }));
    }
    new Setting(contentEl).setName('Days without a trade before it can be closed').setDesc('The account card warns you 5 days before. Empty = no limit (or the firm\'s, when known).')
      .addText((c) => c.setPlaceholder(known.inactivityDays ? String(known.inactivityDays) : '30').setValue(fieldText(r.inactivityDays ?? '')).onChange((v) => { r.inactivityDays = num(v); }));
    new Setting(contentEl).setName('Account type').setDesc('Demo: a practice or contest account, left out of every All-accounts total and the challenge tracker.').addDropdown((d) => d.addOption('eval', 'Eval').addOption('funded', 'Funded').addOption('demo', 'Demo').setValue(this.kind).onChange((v) => { this.kind = v; }));
    new Setting(contentEl).setName('Profit target ($)').setDesc('Empty when the step has none.').addText((c) => c.setValue(fieldText(r.target ?? '')).onChange((v) => { r.target = num(v); }));
    new Setting(contentEl).setName('Max loss ($)').addText((c) => c.setValue(fieldText(r.maxLoss ?? '')).onChange((v) => { r.maxLoss = num(v); }));
    new Setting(contentEl).setName('How the max loss moves').addDropdown((d) => {
      for (const [k, label] of Object.entries(DRAWDOWN_LABELS)) d.addOption(k, tx(label));
      d.setValue(r.drawdown || 'static').onChange((v) => { r.drawdown = v; this.render(); });
    });
    if (r.drawdown && r.drawdown !== 'static') {
      new Setting(contentEl).setName('Stops trailing at').setDesc('Starting balance + this amount. 0 = it stops at the starting balance; empty = it never stops.')
        .addText((c) => c.setValue(fieldText(r.lockAt ?? '')).onChange((v) => { r.lockAt = String(v).trim() === '' ? null : num(v); }));
    }
    new Setting(contentEl).setName('Daily loss limit ($)').addText((c) => c.setValue(fieldText(r.dailyLoss ?? '')).onChange((v) => { r.dailyLoss = num(v); }))
      .addDropdown((d) => d.addOption('soft', tx('Ends the day')).addOption('hard', tx('Fails the account')).setValue(r.dailyHard ? 'hard' : 'soft').onChange((v) => { r.dailyHard = v === 'hard'; }));
    new Setting(contentEl).setName('Minimum trading days').addText((c) => c.setValue(fieldText(r.minDays ?? '')).onChange((v) => { r.minDays = num(v); }));
    new Setting(contentEl).setName('Minimum profitable days').setDesc('Days, and the profit a day needs to count.')
      .addText((c) => c.setPlaceholder('days').setValue(fieldText(r.minProfitableDays ? r.minProfitableDays.days : '')).onChange((v) => { const n = num(v); r.minProfitableDays = n ? { days: n, minProfit: (r.minProfitableDays && r.minProfitableDays.minProfit) || 0 } : null; }))
      .addText((c) => c.setPlaceholder('$ per day').setValue(fieldText(r.minProfitableDays ? r.minProfitableDays.minProfit : '')).onChange((v) => { if (r.minProfitableDays) r.minProfitableDays.minProfit = num(v) || 0; }));
    new Setting(contentEl).setName('Consistency (%)').setDesc('To pass, the best day may be at most this share of the total profit. Empty = no rule.')
      .addText((c) => c.setValue(fieldText(r.consistency ?? '')).onChange((v) => { r.consistency = num(v); }));
    if (!(r.sizeTiers && r.sizeTiers.length) && !positive(r.profitPerContract)) {
      new Setting(contentEl).setName('Max contracts').setDesc('Minis; micros count as a tenth.').addText((c) => c.setValue(fieldText(r.maxContracts ?? '')).onChange((v) => { r.maxContracts = num(v); }));
    }
    const extras = extraRuleLines(r);
    if (extras.length) {
      const box = contentEl.createDiv({ cls: 'tvj-challenge-extras' });
      box.createDiv({ cls: 'tvj-card-title', text: 'Also in this step' });
      for (const line of extras) box.createEl('p', { cls: 'tvj-muted', text: line });
    }
    const buttons = new Setting(contentEl);
    if ((this.plugin.settings.accountInfo[this.account] || {}).rules) {
      buttons.addButton((b) => b.setButtonText('Remove challenge').onClick(async () => {
        delete this.plugin.settings.accountInfo[this.account].rules;
        await this.save(false);
      }));
    }
    buttons.addButton((b) => b.setButtonText('Save').setCta().onClick(() => this.save(true)));
  }
  async save(withRules) {
    const settings = this.plugin.settings;
    const info = { ...(settings.accountInfo[this.account] || {}) };
    const start = Number(String(this.start).replace(/[$,\s]/g, ''));
    if (String(this.start).trim() !== '' && Number.isFinite(start)) info.start = start;
    info.kind = this.kind;
    if (withRules) {
      info.rules = { ...this.rules };
      delete info.maxLoss; // the challenge carries the max loss now
    }
    settings.accountInfo[this.account] = info;
    await this.plugin.saveData(settings);
    this.plugin.refreshViews();
    this.close();
    if (this.onDone) this.onDone();
  }
  onClose() { this.contentEl.empty(); }
}

/** Passing a step: the account is marked passed and the challenge's next step starts as a new, linked account. */
class AdvanceStageModal extends ThemedModal {
  constructor(app, plugin, account, onDone) {
    super(app);
    this.plugin = plugin;
    this.account = account;
    this.onDone = onDone;
    this.rules = (plugin.settings.accountInfo[account] || {}).rules || {};
    this.name = '';
    this.fee = '';
    this.group = null; // the new account's group; chosen in onOpen
    this.paths = []; // the funded paths to choose from; set in onOpen
  }
  async onOpen() {
    await this.plugin.loadChallengeCatalog();
    this.found = this.rules.challengeId ? catalogChallenge(this.plugin.challengeCatalog, this.rules.challengeId) : null;
    this.nextIndex = this.found && (this.rules.step || 0) + 1 < this.found.challenge.steps.length ? (this.rules.step || 0) + 1 : null;
    // passing an evaluation into funded: the funded paths it can go on (Topstep: Standard or Consistency)
    const upNext = this.nextIndex !== null ? this.found.challenge.steps[this.nextIndex] : null;
    this.paths = upNext && upNext.stage !== 'evaluation' ? fundedPaths(this.found.firm, this.found.challenge) : [];
    this.name = this.suggestName();
    // a funded step goes in your funded group (one named like "Funded", or a new "Funded"); another evaluation step
    // stays in the evaluation's group
    const next = this.nextIndex !== null ? this.found.challenge.steps[this.nextIndex] : null;
    const toFunded = !next || stageKind(next.stage) === 'funded';
    const fundedGroup = parseGroups(this.plugin.settings.groups).map((g) => g.name).find((n) => /fund/i.test(n));
    this.newGroup = toFunded && !fundedGroup ? 'Funded' : '';
    this.group = toFunded ? fundedGroup || 'Funded' : groupOf(this.plugin.settings.groups, this.account);
    this.render();
  }
  suggestName() {
    const next = this.nextIndex !== null ? this.found.challenge.steps[this.nextIndex] : null;
    const base = next ? `${sizeLabel(this.found.challenge.size)} ${next.name}` : `${this.account} funded`;
    const taken = new Set([...(this.plugin.settings.accounts || []), ...Object.keys(this.plugin.settings.accountInfo || {})]);
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} #${n}`;
    return name;
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', `Advance ${this.account}`);
    const trades = this.plugin.getTrades().map((x) => x.trade);
    const ch = challengeStatus(this.account, trades, this.plugin.settings.accountInfo);
    if (this.found) {
      const steps = this.found.challenge.steps;
      contentEl.createEl('p', { cls: 'tvj-strong', text: steps.map((s, i) => (i === this.rules.step ? `✓ ${s.name}` : i === this.nextIndex ? `→ ${s.name}` : s.name)).join('   ·   ') });
    }
    if (ch && !ch.ready) {
      const missing = [];
      if (ch.target && !ch.targetHit) missing.push(`the profit target (${money(Math.round(ch.net))} of ${money(ch.target)})`);
      if (!ch.daysOk) missing.push(`the minimum days (${ch.daysTraded} of ${ch.minDays})`);
      if (!ch.profitableOk) missing.push(`the profitable days (${ch.profitableDays} of ${ch.minProfitableDays.days})`);
      if (!ch.consistencyOk) missing.push(`the consistency rule (best day ${Math.round(ch.consistencyShare || 0)}% of profit)`);
      if (missing.length) contentEl.createEl('p', { cls: 'tvj-warn', text: `Not met yet: ${missing.join(', ')}. You can still advance if the firm passed you.` });
    }
    if (this.found && this.nextIndex === null) contentEl.createEl('p', { cls: 'tvj-muted', text: 'This is the last step of the challenge. Advancing marks it passed and starts a Custom account.' });
    contentEl.createEl('p', { cls: 'tvj-muted', text: `${this.account} is marked as passed and keeps its trades. The next step starts as a new account, linked to it.` });
    if (this.paths.length > 1) {
      new Setting(contentEl).setName('Funded path').setDesc('The firm has you choose it when the funded account starts; its payout rules come with the new account.').addDropdown((d) => {
        this.paths.forEach((x, i) => d.addOption(String(i), x.name));
        d.setValue(String(Math.max(0, this.paths.findIndex((x) => x.challenge === this.found.challenge)))).onChange((v) => {
          this.found = { firm: this.found.firm, challenge: this.paths[Number(v)].challenge };
          this.render();
        });
      });
    }
    new Setting(contentEl).setName('New account name').addText((c) => c.setValue(this.name).onChange((v) => { this.name = v; }));
    const groupRow = new Setting(contentEl).setName('Group for the new account').setDesc(`${this.account} stays where it is.`);
    this.plugin.groupSelect(groupRow.controlEl, this.group, (g) => { this.group = g; this.render(); }, this.newGroup);
    new Setting(contentEl).setName('Activation fee ($)').setDesc('Optional: what the firm charged to start the next step. It counts in the challenge tracker.').addText((c) => c.setPlaceholder('0').setValue(this.fee).onChange((v) => { this.fee = v; }));
    new Setting(contentEl).addButton((b) => b.setButtonText('Advance').setCta().onClick(() => this.advance()));
  }
  async advance() {
    const name = this.name.trim();
    const settings = this.plugin.settings;
    if (!name || /[,:\n]/.test(name)) { notify('Type an account name without commas or colons.'); return; }
    if ((settings.accounts || []).includes(name) || settings.accountInfo[name]) { notify('An account with that name already exists.'); return; }
    settings.accountInfo[this.account] = { ...(settings.accountInfo[this.account] || {}), passed: isoDay(new Date()), advancedTo: name };
    if (this.nextIndex !== null) {
      const next = this.found.challenge.steps[this.nextIndex];
      settings.accountInfo[name] = { start: next.start, kind: stageKind(next.stage), rules: rulesFromStep(this.found.firm, this.found.challenge, this.nextIndex), from: this.account };
    } else {
      settings.accountInfo[name] = { start: Number((settings.accountInfo[this.account] || {}).start) || 0, kind: 'funded', from: this.account };
    }
    await this.plugin.addAccount(name, this.group || '');
    const fee = Math.round(Number(String(this.fee || '').replace(/[$,\s]/g, '')) * 100) / 100;
    if (Number.isFinite(fee) && fee > 0) await this.plugin.saveCost({ date: isoDay(new Date()), account: name, firm: '', kind: 'activation', amount: fee, note: '' });
    notify(`${this.account} passed — ${name} added.`);
    this.close();
    if (this.onDone) this.onDone();
  }
  onClose() { this.contentEl.empty(); }
}

/** Deleting an account: its settings go (group membership, balance, status, payouts); you choose what happens
 *  to the trades logged on it. */
class DeleteAccountModal extends ThemedModal {
  constructor(app, plugin, name, onDone) {
    super(app);
    this.plugin = plugin;
    this.name = name;
    this.onDone = onDone;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const count = this.plugin.getTrades().filter((x) => accountName(x.trade) === this.name).length;
    accentTitle(contentEl, 'h2', 'Delete account');
    contentEl.createEl('p', { text: this.name, cls: 'tvj-strong' });
    contentEl.createEl('p', { cls: 'tvj-muted', text: `Trades on this account: ${count}` });
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'The account leaves your list and its groups; its starting balance, status and payouts are removed.' });
    if ((this.plugin.settings.costs || []).some((c) => c.account === this.name)) contentEl.createEl('p', { cls: 'tvj-muted', text: 'What it cost stays in the challenge tracker: the money was spent either way.' });
    const row = new Setting(contentEl);
    row.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));
    if (count) {
      row.addButton((b) => b.setButtonText('Delete, keep the trades').onClick(() => this.run(false)));
      row.addButton((b) => b.setButtonText('Delete with its trades').setWarning().onClick(() => this.run(true)));
      contentEl.createEl('p', { cls: 'tvj-muted', text: 'Kept trades stay in your statistics without an account. Deleted trades go to the trash.' });
    } else {
      row.addButton((b) => b.setButtonText('Delete account').setCta().onClick(() => this.run(false)));
    }
  }
  async run(withTrades) {
    await this.plugin.deleteAccount(this.name, withTrades);
    this.close();
    if (this.onDone) this.onDone();
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** Payouts taken from accounts: they count toward "Payouts" and come off the account balance. */
class PayoutModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.f = { date: isoDay(new Date()), account: '', amount: '' };
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Payouts');
    const all = this.plugin.getTrades().map((x) => x.trade);
    const accounts = this.plugin.allAccounts(all).filter((a) => a !== NO_ACCOUNT && !this.plugin.hiddenInPickers(a, all, this.f.account));
    if (!this.f.account) this.f.account = accounts[0] || '';
    new Setting(contentEl).setName('Date').addText((c) => c.setPlaceholder('YYYY-MM-DD').setValue(this.f.date).onChange((v) => { this.f.date = v; }));
    new Setting(contentEl).setName('Account').addDropdown((d) => {
      for (const a of accounts) d.addOption(a, a);
      d.setValue(this.f.account).onChange((v) => { this.f.account = v; });
    });
    new Setting(contentEl).setName('Amount ($)').addText((c) => c.setPlaceholder('1500').setValue(this.f.amount).onChange((v) => { this.f.amount = v; }));
    new Setting(contentEl).addButton((b) => b.setButtonText('Add payout').setCta().onClick(() => this.add()));

    const list = [...this.plugin.settings.payouts].sort((a, b) => b.date.localeCompare(a.date));
    if (list.length) contentEl.createEl('h3', { text: `Recorded payouts · ${money(sum(list.map(payoutReceived)))}` });
    for (const x of list) {
      const row = contentEl.createDiv({ cls: 'tvj-row' });
      row.createSpan({ text: `${x.date} · ${x.account}` });
      const right = row.createSpan();
      right.createSpan({ cls: 'tvj-pos', text: money(payoutReceived(x)) });
      right.createEl('button', { text: '×', attr: { 'aria-label': 'Delete this payout' } }).addEventListener('click', async () => {
        this.plugin.settings.payouts = this.plugin.settings.payouts.filter((y) => y.id !== x.id);
        await this.plugin.saveData(this.plugin.settings);
        this.render();
      });
    }
  }
  async add() {
    const amount = Number(String(this.f.amount).replace(/[$,\s]/g, ''));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.f.date.trim()) || !this.f.account || !Number.isFinite(amount) || amount <= 0) {
      notify('Fill in a date (YYYY-MM-DD), an account and a positive amount.');
      return;
    }
    const payout = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, date: this.f.date.trim(), account: this.f.account, amount };
    this.plugin.settings.payouts = [...this.plugin.settings.payouts, payout];
    await this.plugin.saveData(this.plugin.settings);
    this.f.amount = '';
    notify(`Payout recorded: ${money(amount)}`);
    this.render();
    new CertificateModal(this.app, this.plugin, payout).open();
  }
  onClose() {
    this.contentEl.empty();
    this.plugin.refreshViews();
  }
}

/** One challenge cost: an evaluation, an activation fee, a reset or another fee. `preset` fills the form (an account,
 *  a type); a preset with an id edits that cost and offers Delete. Costs count in the challenge tracker only: they
 *  never change an account's balance. */
class CostModal extends ThemedModal {
  constructor(app, plugin, preset, onDone) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.editing = !!(preset && preset.id);
    this.f = { date: isoDay(new Date()), account: '', firm: '', kind: 'eval', note: '', ...(preset || {}) };
    this.f.amount = this.f.amount === undefined || this.f.amount === null ? '' : String(this.f.amount);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', this.editing ? 'Edit cost' : 'Add a cost');
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'What you paid a prop firm: the evaluation, an activation fee, a reset or another fee. It counts in the challenge tracker and does not change the account balance.' });
    const settings = this.plugin.settings;
    const accounts = [...new Set([...this.plugin.allAccounts(this.plugin.getTrades().map((x) => x.trade)), ...(settings.accounts || [])])].filter((a) => a && a !== NO_ACCOUNT);
    const firms = [...new Set([...PROP_FIRMS.firms.map((f) => f.name), ...Object.values(settings.accountInfo || {}).map((i) => (i.rules && i.rules.firm) || ''), ...(settings.costs || []).map((c) => c.firm || '')])].filter(Boolean).sort();
    const suggest = (input, values) => {
      const id = `tvj-list-${Math.random().toString(36).slice(2, 8)}`;
      const list = contentEl.createEl('datalist', { attr: { id } });
      for (const v of values) list.createEl('option', { attr: { value: v } });
      input.setAttribute('list', id);
    };
    let firmInput = null;
    const firmHint = () => { if (firmInput) firmInput.setAttribute('placeholder', accountFirm(this.f.account.trim(), settings.accountInfo, settings.costs || []) || 'Topstep'); };
    new Setting(contentEl).setName('Type').addDropdown((d) => {
      for (const [k, label] of Object.entries(COST_KINDS)) d.addOption(k, tx(label));
      d.setValue(this.f.kind).onChange((v) => { this.f.kind = v; });
    });
    new Setting(contentEl).setName('Amount ($)').addText((c) => {
      c.setPlaceholder('150').setValue(this.f.amount).onChange((v) => { this.f.amount = v; });
      c.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.save(); });
      if (!this.f.amount) window.setTimeout(() => c.inputEl.focus(), 0);
    });
    new Setting(contentEl).setName('Date').addText((c) => {
      c.inputEl.type = 'date';
      c.setValue(this.f.date).onChange((v) => { this.f.date = v; });
    });
    new Setting(contentEl).setName('Account').setDesc('Optional. One of your accounts, or any name (an account no longer in the journal).').addText((c) => {
      c.setPlaceholder('50K Combine #1').setValue(this.f.account).onChange((v) => { this.f.account = v; firmHint(); });
      suggest(c.inputEl, accounts);
    });
    new Setting(contentEl).setName('Firm').setDesc("Empty = the firm of the account's challenge.").addText((c) => {
      c.setValue(this.f.firm).onChange((v) => { this.f.firm = v; });
      firmInput = c.inputEl;
      suggest(c.inputEl, firms);
      firmHint();
    });
    new Setting(contentEl).setName('Note').addText((c) => c.setPlaceholder('Promo code, reset after the DLL …').setValue(this.f.note).onChange((v) => { this.f.note = v; }));
    const buttons = new Setting(contentEl);
    if (this.editing) buttons.addButton((b) => b.setButtonText('Delete').setWarning().onClick(async () => {
      await this.plugin.deleteCost(this.f.id);
      this.close();
      if (this.onDone) this.onDone();
    }));
    buttons.addButton((b) => b.setButtonText(this.editing ? 'Save' : 'Add cost').setCta().onClick(() => this.save()));
  }
  async save() {
    const amount = Math.round(Number(String(this.f.amount).replace(/[$,\s]/g, '')) * 100) / 100;
    const date = String(this.f.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount <= 0) {
      notify('Fill in a date and a positive amount.');
      return;
    }
    const cost = { date, account: this.f.account.trim(), firm: this.f.firm.trim(), kind: COST_KINDS[this.f.kind] ? this.f.kind : 'other', amount, note: this.f.note.trim() };
    if (this.editing) cost.id = this.f.id;
    await this.plugin.saveCost(cost);
    notify(this.editing ? 'Cost saved.' : `Cost added: ${money(amount)}`);
    this.close();
    if (this.onDone) this.onDone();
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** Puts a card on the clipboard as a picture. The clipboard item is made at once, inside the click, with the
 *  picture still on its way: Safari refuses a copy that only starts after waiting for something. */
async function copyCanvas(canvas, done) {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('this browser cannot copy pictures');
    const png = new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the card could not be turned into a picture'))), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    notify(done);
  } catch (error) {
    console.error('TrueVision Journal: copying the card failed', error);
    notify('Could not copy the image — use "Save to vault" instead.');
  }
}

