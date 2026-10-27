// ---------- the lobby's layout: its sections in your order, each shown or hidden ----------

/** The lobby's sections, top to bottom as they come: [key, label]. */
const LOBBY_SECTIONS = [
  ['welcome', 'Welcome message'], ['profile', 'Trader profile'], ['calendar', 'Economic calendar'], ['music', 'Music card'],
  ['cards', 'Flex and gym cards'], ['ranks', 'Ranks'], ['career', 'Career stats'], ['activity', 'Activity'],
  ['streaks', 'Streaks'], ['points', 'Rank points and badges'],
];
/** Sections with a switch of their own from before (Settings), kept in step with the layout window. */
const LOBBY_OWN_SWITCH = { welcome: 'lobbyWelcomeHidden', calendar: 'lobbyCalendarHidden', music: 'lobbyMusicHidden' };
/** A layout in your order: the known keys you placed, then any one not placed yet, right after the one before it. */
function layoutOrder(sections, saved) {
  const keys = sections.map(([k]) => k);
  const out = [...new Set((Array.isArray(saved) ? saved : []).filter((k) => keys.includes(k)))];
  keys.forEach((k, i) => {
    if (out.includes(k)) return;
    const before = keys.slice(0, i).reverse().find((x) => out.includes(x));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, k);
  });
  return out;
}
/** Your lobby order (settings.lobbyOrder). */
const lobbyOrder = (saved) => layoutOrder(LOBBY_SECTIONS, saved);
/** Whether a lobby section is hidden: its own switch, or settings.lobbyHidden. */
const lobbyHidden = (settings, key) => (LOBBY_OWN_SWITCH[key] ? !!settings[LOBBY_OWN_SWITCH[key]] : (settings.lobbyHidden || []).includes(key));

/** What a Customize window lays out: its sections, where your order and hidden ones are kept, and the old switches. */
const LOBBY_LAYOUT = { title: 'Customize lobby', intro: 'Move the lobby\'s sections up or down, and switch off the ones you don\'t need.', sections: LOBBY_SECTIONS, order: 'lobbyOrder', hidden: 'lobbyHidden', own: LOBBY_OWN_SWITCH };

/** Customize: every section with ↑ / ↓ to move it and a switch to show it; Reset puts them back. */
class CustomizeModal extends ThemedModal {
  constructor(app, plugin, layout) {
    super(app);
    this.plugin = plugin;
    this.layout = layout;
  }
  onOpen() { this.render(); }
  async save() {
    await this.plugin.saveData(this.plugin.settings);
    this.plugin.refreshViews();
    this.keepScroll(() => this.render());
  }
  render() {
    const { contentEl } = this;
    const L = this.layout, own = L.own || {};
    contentEl.empty();
    const s = this.plugin.settings;
    const isHidden = (key) => (own[key] ? !!s[own[key]] : (s[L.hidden] || []).includes(key));
    accentTitle(contentEl, 'h2', L.title);
    contentEl.createEl('p', { cls: 'tvj-muted', text: L.intro });
    const order = layoutOrder(L.sections, s[L.order]);
    const label = Object.fromEntries(L.sections);
    const list = contentEl.createDiv({ cls: 'tvj-lobby-layout' });
    order.forEach((key, i) => {
      const hidden = isHidden(key);
      const row = list.createDiv({ cls: `tvj-lobby-layout-row${hidden ? ' is-off' : ''}` });
      const move = (to) => { const next = [...order]; next.splice(i, 1); next.splice(to, 0, key); s[L.order] = next; this.save(); };
      const up = row.createEl('button', { cls: 'tvj-lobby-layout-move', text: '↑', attr: { 'aria-label': `${tx('Move up')}: ${tx(label[key])}` } });
      up.disabled = i === 0;
      up.addEventListener('click', () => move(i - 1));
      const down = row.createEl('button', { cls: 'tvj-lobby-layout-move', text: '↓', attr: { 'aria-label': `${tx('Move down')}: ${tx(label[key])}` } });
      down.disabled = i === order.length - 1;
      down.addEventListener('click', () => move(i + 1));
      row.createSpan({ cls: 'tvj-lobby-layout-name', text: label[key] });
      const box = row.createEl('input', { type: 'checkbox', attr: { 'aria-label': `${tx('Show')}: ${tx(label[key])}` } });
      box.checked = !hidden;
      box.addEventListener('change', () => {
        if (own[key]) s[own[key]] = !box.checked;
        else s[L.hidden] = box.checked ? (s[L.hidden] || []).filter((k) => k !== key) : [...new Set([...(s[L.hidden] || []), key])];
        this.save();
      });
    });
    const foot = contentEl.createDiv({ cls: 'tvj-options tvj-lobby-layout-foot' });
    foot.createEl('button', { text: 'Reset' }).addEventListener('click', () => {
      delete s[L.order]; delete s[L.hidden];
      for (const flag of Object.values(own)) delete s[flag];
      this.save();
    });
    foot.createEl('button', { text: 'Done', cls: 'mod-cta' }).addEventListener('click', () => this.close());
  }
  onClose() { this.contentEl.empty(); }
}

/** Customize lobby. */
class LobbyLayoutModal extends CustomizeModal {
  constructor(app, plugin) { super(app, plugin, LOBBY_LAYOUT); }
}
