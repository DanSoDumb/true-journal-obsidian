// ---------- the first-run guide: five short steps for someone who just installed True Journal ----------

/** The welcome guide: language, your name, a first account and its challenge, getting trades in, and where things
 *  are. Every step saves as you go and can be skipped; it opens by itself only on a first install. */
class WelcomeGuideModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.step = 0;
    this.accountName = '';
  }
  onOpen() {
    this.modalEl.addClass('tvj-guide-modal');
    this.render();
  }
  async save() { await this.plugin.saveData(this.plugin.settings); this.plugin.refreshViews(); }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    const s = this.plugin.settings, vi = LANG === 'vi';
    const say = (en, v) => (vi ? v : en);
    const steps = 5;
    const dots = contentEl.createDiv({ cls: 'tvj-guide-dots' });
    for (let i = 0; i < steps; i++) dots.createSpan({ cls: `tvj-guide-dot${i === this.step ? ' is-on' : i < this.step ? ' is-done' : ''}` });
    const body = contentEl.createDiv({ cls: 'tvj-guide-body' });
    const h = (en, v) => body.createEl('h2', { text: say(en, v) });
    const p = (en, v, cls = 'tvj-muted') => body.createEl('p', { cls, text: say(en, v) });
    const button = (parent, en, v, run, cta) => { const b = parent.createEl('button', { text: say(en, v), cls: cta ? 'mod-cta' : '' }); b.addEventListener('click', run); return b; };
    if (this.step === 0) {
      h('Welcome to True Journal', 'Chào mừng đến với True Journal');
      p('Your trades as notes in this vault: reviews that ask the right questions, stats, prop firm rules and payouts, all on your computer.', 'Lệnh của bạn là các ghi chú trong vault này: review với câu hỏi đúng chỗ, thống kê, luật prop firm và payout, tất cả trên máy bạn.');
      const row = body.createDiv({ cls: 'tvj-guide-field' });
      row.createSpan({ text: say('Language', 'Ngôn ngữ') });
      const pick = row.createEl('select', { cls: 'dropdown' });
      for (const [v, t] of [['auto', 'Auto'], ['en', 'English'], ['vi', 'Tiếng Việt']]) pick.createEl('option', { value: v, text: t });
      pick.value = s.language || 'auto';
      pick.addEventListener('change', async () => { s.language = pick.value; this.plugin.applyLanguage(); await this.save(); this.render(); });
    } else if (this.step === 1) {
      h('What should we call you?', 'Bạn muốn được gọi là gì?');
      p('The lobby greets you by this name, and your cards show it.', 'Sảnh chào bạn bằng tên này, và các thẻ của bạn hiện tên này.');
      const input = body.createEl('input', { type: 'text', cls: 'tvj-guide-input', attr: { placeholder: 'Trader', 'aria-label': say('Your name', 'Tên của bạn') } });
      input.value = s.profileName && s.profileName !== 'Trader' ? s.profileName : '';
      input.addEventListener('change', async () => { s.profileName = input.value.trim() || 'Trader'; await this.save(); });
      window.setTimeout(() => input.focus(), 0);
    } else if (this.step === 2) {
      h('Your first account', 'Tài khoản đầu tiên');
      p('Name it the way you know it, then pick its prop firm and challenge: the rules fill in by themselves. A personal account needs no rules.', 'Đặt tên theo cách bạn quen gọi, rồi chọn prop firm và thử thách: luật sẽ tự điền. Tài khoản cá nhân không cần luật.');
      const row = body.createDiv({ cls: 'tvj-guide-field' });
      const input = row.createEl('input', { type: 'text', cls: 'tvj-guide-input', attr: { placeholder: '50K Combine #1', 'aria-label': say('Account name', 'Tên tài khoản') } });
      input.value = this.accountName;
      input.addEventListener('input', () => { this.accountName = input.value; });
      button(row, 'Add account', 'Thêm tài khoản', async () => {
        const name = this.accountName.trim();
        if (!name || /[,:\n]/.test(name)) { notify(name ? 'Account names cannot contain commas or colons.' : 'Type a name for the account.'); return; }
        // the same window as + Account: the firm, challenge and step come with it
        const add = new AddAccountModal(this.app, this.plugin, () => this.render());
        add.name = name;
        this.accountName = '';
        add.onClose = () => { add.contentEl.empty(); this.render(); };
        add.open();
      }, true);
      const have = (s.accounts || []);
      if (have.length) {
        const list = body.createDiv({ cls: 'tvj-guide-accounts' });
        for (const a of have) {
          const info = (s.accountInfo || {})[a] || {};
          const item = list.createDiv({ cls: 'tvj-guide-account' });
          item.createSpan({ text: a });
          item.createSpan({ cls: 'tvj-muted', text: info.rules ? [info.rules.firm, info.rules.challenge].filter(Boolean).join(' · ') : say('no rules yet', 'chưa có luật') });
          button(item, info.rules ? 'Rules' : 'Set rules', info.rules ? 'Luật' : 'Đặt luật', () => new ChallengeRulesModal(this.app, this.plugin, a, () => this.render()).open());
        }
      }
    } else if (this.step === 3) {
      h('Get your trades in', 'Đưa lệnh vào');
      p('Import an export from your platform (TopstepX, Tradovate, MetaTrader, NinjaTrader, cTrader and more), log one trade, or just type a day\'s P&L.', 'Nhập file xuất từ nền tảng (TopstepX, Tradovate, MetaTrader, NinjaTrader, cTrader…), ghi một lệnh, hoặc chỉ nhập P&L của một ngày.');
      const row = body.createDiv({ cls: 'tvj-guide-actions' });
      button(row, 'Import trades', 'Nhập lệnh từ tệp', () => new ImportCsvModal(this.app, this.plugin).open(), true);
      button(row, 'Log a trade', 'Ghi một lệnh', () => new NewTradeModal(this.app, this.plugin).open());
      button(row, "Type a day's P&L", 'Nhập P&L một ngày', () => { const m = new NewTradeModal(this.app, this.plugin); m.f.pnlOnly = true; m.open(); });
      const n = this.plugin.getTrades().length;
      if (n) p(`${n} trade${n === 1 ? '' : 's'} in your journal so far.`, `Đã có ${n} lệnh trong nhật ký.`, 'tvj-pos');
    } else {
      h("You're set", 'Xong rồi');
      const tips = body.createEl('ul', { cls: 'tvj-guide-tips' });
      for (const [en, v] of [
        ['The side panel (left) has every screen: the Lobby, Dashboard, Journal, Accounts and the Challenge tracker.', 'Thanh bên (trái) có mọi màn hình: Sảnh, Dashboard, Nhật ký, Tài khoản và Theo dõi thử thách.'],
        ['After each trade, Review asks a few questions; the calendar\'s days open a day review.', 'Sau mỗi lệnh, Review hỏi vài câu; mỗi ngày trên lịch mở ra review ngày.'],
        ['Accounts shows your rules as you trade: room to the max loss, daily loss, consistency and payouts.', 'Tài khoản hiện luật khi bạn giao dịch: khoảng cách tới mức lỗ tối đa, lỗ ngày, độ đều và payout.'],
        ['Arrange (top of the Lobby) puts its sections in your order; Settings has the theme and colours.', 'Sắp xếp (đầu Sảnh) đổi thứ tự các phần; Cài đặt có theme và màu sắc.'],
        ['This guide is in the command palette: "Show the welcome guide".', 'Hướng dẫn này có trong bảng lệnh: "Mở hướng dẫn bắt đầu".'],
      ]) tips.createEl('li', { text: say(en, v) });
    }
    const nav = contentEl.createDiv({ cls: 'tvj-guide-nav' });
    if (this.step > 0) button(nav, 'Back', 'Quay lại', () => { this.step--; this.render(); });
    else button(nav, 'Skip the guide', 'Bỏ qua', () => this.close());
    nav.createDiv({ cls: 'tvj-guide-gap' });
    if (this.step < steps - 1) button(nav, 'Next', 'Tiếp', () => { this.step++; this.render(); }, true);
    else button(nav, 'Open the lobby', 'Mở sảnh', () => { this.close(); this.plugin.openView(LOBBY_VIEW_TYPE); }, true);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.plugin.settings.guideShown) { this.plugin.settings.guideShown = true; this.plugin.saveData(this.plugin.settings); }
  }
}

