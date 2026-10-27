// ---------- the lobby's welcome: a greeting by the time of day, and one line about today ----------

/** Greetings by the time of day ([English, Vietnamese]): morning, afternoon, evening, late night. One is picked a day. */
const WELCOME_GREETINGS = [
  [['Good morning', 'Chào buổi sáng'], ['Morning', 'Sáng rồi'], ['Rise and grind', 'Dậy và chiến thôi'], ['Fresh day', 'Một ngày mới'], ['Coffee first', 'Cà phê trước đã']],
  [['Good afternoon', 'Chào buổi chiều'], ['Afternoon', 'Buổi chiều rồi'], ['Halfway through the day', 'Đã qua nửa ngày'], ['Back at the desk', 'Quay lại bàn rồi'], ['Hope the day is kind', 'Mong hôm nay suôn sẻ']],
  [['Good evening', 'Chào buổi tối'], ['Evening', 'Tối rồi'], ['Session time', 'Đến giờ vào phiên'], ['New York is open', 'New York mở cửa rồi'], ['Ready for the open', 'Sẵn sàng cho phiên mở']],
  [['Up late', 'Khuya rồi'], ['Still up', 'Vẫn còn thức'], ['Night owl', 'Cú đêm'], ['Late session', 'Phiên khuya'], ['Burning the midnight oil', 'Thức khuya chiến đấu']],
];

/** Lines for a day with nothing else to say ([English, Vietnamese]): one a day, the same all day. */
const WELCOME_LINES = [
  ['No setup, no trade.', 'Không có setup thì không vào lệnh.'],
  ['Plan the trade, then trade the plan.', 'Lên kế hoạch trước, rồi làm đúng kế hoạch.'],
  ['Protect the account first; the profit follows.', 'Giữ tài khoản trước, lợi nhuận sẽ đến sau.'],
  ['One clean trade beats five rushed ones.', 'Một lệnh sạch hơn năm lệnh vội.'],
  ['Your stop is part of the plan.', 'Stop loss là một phần của kế hoạch.'],
  ['Let price come to you.', 'Để giá tự đến với bạn.'],
  ['Review the process, not just the P&L.', 'Review cách làm, không chỉ P&L.'],
  ['Sitting on your hands is a position too.', 'Ngồi yên cũng là một quyết định.'],
  ['Wait for the liquidity to be taken first.', 'Chờ thanh khoản bị lấy trước đã.'],
  ['The market will be open tomorrow too.', 'Ngày mai thị trường vẫn mở.'],
  ['Size down when in doubt.', 'Khi phân vân, hãy giảm khối lượng.'],
  ['A missed trade costs nothing; a forced one does.', 'Lỡ một lệnh không mất gì; ép một lệnh thì có.'],
  ['Know where you are wrong before you get in.', 'Biết mình sai ở đâu trước khi vào lệnh.'],
  ['Stick to your times; the best moves come on schedule.', 'Giữ đúng khung giờ; những cú chạy đẹp đến đúng giờ.'],
  ['Hit your daily limit? The day is done.', 'Chạm giới hạn ngày? Hôm nay vậy là xong.'],
  ['Green or red, write it down.', 'Xanh hay đỏ, đều ghi lại.'],
  ['Trade what you see, not what you hope.', 'Giao dịch theo điều bạn thấy, không phải điều bạn mong.'],
  ['Small losses are part of the job.', 'Lỗ nhỏ là một phần của công việc.'],
  ['Consistency pays more than one big day.', 'Đều đặn đáng giá hơn một ngày thắng lớn.'],
  ['Check the news before the open.', 'Xem lịch tin trước giờ mở phiên.'],
  ['Follow the rules you wrote when you were calm.', 'Làm theo luật bạn viết lúc bình tĩnh.'],
  ['Revenge trading never paid a payout.', 'Gỡ lệnh chưa bao giờ mang lại payout.'],
  ['The best trades feel easy.', 'Lệnh đẹp nhất thường rất dễ vào.'],
  ['Process first. The money is a side effect.', 'Quy trình trước. Tiền chỉ là kết quả đi kèm.'],
];

/** Lines for Saturday and Sunday, when nothing was traded: one a day. */
const WEEKEND_LINES = [
  ['Markets are closed for the weekend: a good day to review or backtest.', 'Cuối tuần thị trường nghỉ: hợp để review hoặc backtest.'],
  ['Weekend: mark up next week\'s levels while it is quiet.', 'Cuối tuần: đánh dấu các mức giá của tuần sau khi còn yên tĩnh.'],
  ['No market today. Rest counts as training too.', 'Hôm nay thị trường nghỉ. Nghỉ ngơi cũng là luyện tập.'],
  ['Weekend: look back at the week before you plan the next one.', 'Cuối tuần: nhìn lại tuần này trước khi lên kế hoạch tuần sau.'],
  ['Markets are closed: backtest the setup you trust least.', 'Thị trường nghỉ: backtest setup bạn ít tin nhất.'],
];

/** One of `list` for the day (the same all day, another tomorrow). `salt` keeps two lists from moving together. */
const ofTheDay = (list, today, salt = 0) => {
  const day = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86400000) + salt;
  return list[((day % list.length) + list.length) % list.length];
};

/** The lobby's welcome for `name` at `now`, in the current language: { title, line }. The title greets by the time
 *  of day, in one of WELCOME_GREETINGS. The line says how today went (its trades and P&L) and how many trades wait
 *  for a review; on a day with neither, one of WEEKEND_LINES at the weekend, or else one of WELCOME_LINES. */
function welcomeMessage(name, trades, now = new Date()) {
  const vi = LANG === 'vi';
  const h = now.getHours();
  const part = h >= 5 && h < 12 ? 0 : h < 17 && h >= 12 ? 1 : h < 22 && h >= 17 ? 2 : 3;
  const who = String(name || '').trim() || 'Trader';
  const today = isoDay(now);
  const hello = ofTheDay(WELCOME_GREETINGS[part], today, part);
  const title = `${vi ? hello[1] : hello[0]}, ${who}`;
  const done = (trades || []).filter((t) => t.date === today);
  const waiting = (trades || []).filter((t) => !t.reviewed).length;
  const parts = [];
  if (done.length) {
    const net = signedMoney(Math.round(sum(done.map(netPnl)) * 100) / 100);
    parts.push(vi ? `Hôm nay: ${net} qua ${done.length} lệnh` : `Today: ${net} over ${done.length} trade${done.length === 1 ? '' : 's'}`);
  }
  if (waiting) parts.push(vi ? `${waiting} lệnh đang chờ review` : `${waiting} trade${waiting === 1 ? '' : 's'} waiting for a review`);
  if (parts.length) return { title, line: `${parts.join(' · ')}.` };
  const pick = ofTheDay(now.getDay() === 0 || now.getDay() === 6 ? WEEKEND_LINES : WELCOME_LINES, today);
  return { title, line: vi ? pick[1] : pick[0] };
}

class LobbyView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.scope = 'all';
  }
  getViewType() { return LOBBY_VIEW_TYPE; }
  getDisplayText() { return tx('TrueVision Journal — lobby'); }
  getIcon() { return ICON_ID; }

  async onOpen() {
    this.register(keepLocalized(this.contentEl));
    playEnter(this.contentEl);
    this.render();
    this.plugin.watchData(this, () => this.render());
  }

  /** The gym card beside the member card: your streak, this week and sixteen weeks of training, in the look picked
   *  in the gym card dialog (your own picture or video too, playing silent unless `calm`). Opens that dialog. */
  renderLobbyGymCard(parent, calm) {
    const settings = this.plugin.settings;
    const sessions = this.plugin.getGymSessions().map((x) => x.session);
    const target = Math.max(1, Number(settings.gymTarget) || 3);
    const st = gymStats(sessions, target);
    const best = gymRecords(sessions).filter((r) => r.weight).sort((a, b) => b.weight - a.weight)[0] || null;
    const data = { holder: settings.profileName, streak: st.streak, week: st.week, target, month: st.month, minutes: st.minutes, total: sessions.length, best, grid: gymGrid(sessions) };
    const hasPicture = !!this.plugin.pictureFile('gym-card');
    let look = GYM_CARDS.find((k) => k.key === settings.gymCard) || GYM_CARDS[0];
    if (look.key === 'custom' && !hasPicture) look = GYM_CARDS[0];

    const fig = parent.createDiv({ cls: 'tvj-member-fig' });
    fig.createDiv({ cls: 'tvj-card-title', text: 'Gym card' });
    const button = fig.createEl('button', { cls: 'tvj-member-card', attr: { 'aria-label': 'Open the gym card' } });
    const canvas = button.createEl('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    drawGymCard(canvas, data, look);
    button.addEventListener('click', () => new GymCardModal(this.app, this.plugin).open());
    addCardTilt(button);
    if (look.key !== 'custom') return;
    this.plugin.loadPicture('gym-card').then((picture) => {
      if (!picture || !canvas.isConnected) return;
      drawGymCard(canvas, data, look, picture);
      if (calm || !(picture instanceof HTMLVideoElement)) return;
      let last = -1;
      const tick = () => {
        if (!canvas.isConnected) { picture.pause(); return; }
        if (picture.currentTime !== last) {
          last = picture.currentTime;
          drawGymCard(canvas, data, look, picture);
        }
        window.requestAnimationFrame(tick);
      };
      picture.muted = true;
      picture.loop = true;
      picture.play().catch(() => {});
      tick();
    });
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tvj-dashboard');
    const settings = this.plugin.settings;
    const groups = parseGroups(settings.groups);
    const allItems = this.plugin.getTrades();
    const allTrades = allItems.map((x) => x.trade);
    const trades = filterScope(allTrades, this.scope, groups);
    const gym = this.plugin.getGymSessions().map((x) => x.session);
    const gymTarget = Math.max(1, Number(settings.gymTarget) || 3);
    const journalTarget = Math.max(1, Number(settings.journalTarget) || 3);
    const streaks = computeStreaks(trades, gym, gymTarget, journalTarget);
    const scoped = scopeAccounts(this.scope, this.plugin.allAccounts(allTrades).filter((a) => a !== NO_ACCOUNT), groups);
    const rank = computeRank(trades, streaks, { accountInfo: settings.accountInfo, accounts: scoped, maxTradesPerDay: settings.maxTradesPerDay });
    const level = computeLevel(trades, gym.length);
    const stats = computeStats(trades);
    const streak = currentStreak(trades);
    const badges = achievements(trades, gym.length, streaks);
    const recent = [...trades].sort(byTime).slice(-12);
    const pending = trades.filter((t) => !t.reviewed).length;
    const name = this.plugin.source === 'own' ? settings.profileName || 'Trader' : this.plugin.source.split('/').pop();
    const payoutTotal = sum(settings.payouts.filter((x) => scopeAccounts(this.scope, this.plugin.allAccounts(allTrades), groups).includes(x.account)).map(payoutReceived));
    const profile = { rank, level, stats, name, verified: this.plugin.source === 'own' && !!settings.profileVerified, tag: settings.profileTag, streak, streaks, form: recent.map(netPnl), badges, payouts: payoutTotal };

    const head = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(head, LOBBY_VIEW_TYPE);
    const tools = head.createDiv({ cls: 'tvj-options' });
    this.plugin.scopeSelect(tools, allTrades, groups, this.scope, (v) => { this.scope = v; this.render(); });
    if (this.plugin.source === 'own') tools.createEl('button', { text: 'Customize', attr: { 'aria-label': 'Customize lobby' } }).addEventListener('click', () => new LobbyLayoutModal(this.app, this.plugin).open());
    // each section's first element, so they can be put in your order (and hidden) once all are drawn
    const starts = [];
    const begin = (key) => starts.push([key, root.children.length]);

    // a welcome by the time of day, with a line about today (Settings → "Welcome message in the lobby"); it slides in
    // the first time the lobby is drawn, not on every redraw
    begin('welcome');
    if (this.plugin.source === 'own' && !settings.lobbyWelcomeHidden) {
      const hello = welcomeMessage(name, trades);
      const box = root.createDiv({ cls: `tvj-welcome${this.welcomed ? '' : ' is-new'}` });
      // the name in the italic accent face
      const titleEl = box.createDiv({ cls: 'tvj-welcome-title' });
      const comma = hello.title.lastIndexOf(', ');
      if (comma < 0) titleEl.setText(hello.title);
      else { titleEl.appendText(hello.title.slice(0, comma + 2)); titleEl.createEl('em', { cls: 'tvj-accent-word', text: hello.title.slice(comma + 2) }); }
      if (hello.line) box.createDiv({ cls: 'tvj-welcome-line', text: hello.line });
      this.welcomed = true;
    }

    // banner: emblem and rank on the left, identity and level in the middle, the menu on the right
    begin('profile');
    const banner = root.createDiv({ cls: 'tvj-lobby' });
    banner.style.setProperty('--tvj-tier', rank.color);
    // your profile card's moving background (a video file, YouTube or TikTok) also plays here, silent, behind the profile
    if (this.plugin.source === 'own' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const file = this.plugin.pictureFile('profile-card');
      const stored = file ? (settings.pictureYouTube || {})['profile-card'] || '' : '';
      if (stored) {
        const back = banner.createDiv({ cls: `tvj-lobby-back ${String(stored).startsWith('tiktok:') ? 'is-upright' : ''}` });
        streamFrame(back, stored);
        banner.addClass('has-back');
      } else if (file && CARD_VIDEO_EXTS.includes(file.extension)) {
        const back = banner.createDiv({ cls: 'tvj-lobby-back' });
        const video = back.createEl('video', { attr: { src: this.app.vault.getResourcePath(file), playsinline: '', loop: '', 'aria-hidden': 'true' } });
        video.muted = true;
        video.play().catch(() => {});
        banner.addClass('has-back');
      }
    }
    const emblem = banner.createDiv({ cls: 'tvj-lobby-rank' });
    emblem.appendChild(this.plugin.emblemEl(rank, 150));
    emblem.createDiv({ cls: 'tvj-lobby-tier', text: rank.label });
    emblem.createDiv({ cls: 'tvj-muted', text: rank.ranked ? `${rank.score} RP` : `${rank.need} more trade${rank.need === 1 ? '' : 's'} to be ranked` });

    const who = banner.createDiv({ cls: 'tvj-lobby-who' });
    who.createDiv({ cls: 'tvj-eyebrow', text: 'Trader profile' });
    const nameRow = who.createDiv({ cls: 'tvj-lobby-name' });
    // profile picture: click to upload or change it (your own journal only)
    const own = this.plugin.source === 'own';
    const avatarFile = own ? this.plugin.avatarFile() : null;
    const avatar = nameRow.createEl(own ? 'button' : 'span', { cls: `tvj-avatar ${avatarFile ? 'has-photo' : ''}`, attr: own ? { 'aria-label': avatarFile ? 'Change profile picture' : 'Upload a profile picture' } : {} });
    if (avatarFile) avatar.createEl('img', { attr: { src: `${this.app.vault.getResourcePath(avatarFile)}`, alt: '' } });
    else avatar.createSpan({ text: (name || 'T').trim().slice(0, 1).toUpperCase() });
    if (own) {
      const input = nameRow.createEl('input', { attr: { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: 'true' } });
      input.addEventListener('change', () => { if (input.files && input.files[0]) this.plugin.setAvatar(input.files[0]); });
      avatar.addEventListener('click', () => input.click());
    }
    nameRow.createSpan({ text: name });
    if (avatarFile) {
      nameRow.createEl('button', { text: '×', cls: 'tvj-ghost', attr: { 'aria-label': 'Remove profile picture' } }).addEventListener('click', () => this.plugin.setAvatar(null));
    }
    nameRow.createEl('button', { text: '✎', cls: 'tvj-ghost', attr: { 'aria-label': 'Edit profile name' } }).addEventListener('click', () => {
      new TextPromptModal(this.app, 'Profile name', name, async (v) => {
        settings.profileName = v;
        await this.plugin.saveData(settings);
        this.render();
      }).open();
    });
    if (settings.profileTag) who.createDiv({ cls: 'tvj-muted', text: settings.profileTag });
    const meter = (parent, label, right, share) => {
      const row = parent.createDiv({ cls: 'tvj-lobby-meter' });
      const top = row.createDiv({ cls: 'tvj-lobby-meter-top' });
      top.createSpan({ text: label });
      top.createSpan({ cls: 'tvj-muted', text: right });
      row.createDiv({ cls: 'tvj-meter' }).createDiv({ cls: 'tvj-meter-fill' }).style.width = `${Math.round(clamp01(share) * 100)}%`;
    };
    meter(who, `Level ${level.level}`, `${level.into} / ${level.need} XP`, level.into / level.need);
    if (rank.ranked && rank.next) meter(who, rank.label, `${rank.next - rank.score} RP to ${rank.nextLabel}`, (rank.score - rank.floor) / (rank.next - rank.floor));
    else if (rank.ranked) meter(who, rank.label, `${rank.score} / 1000 RP`, rank.score / 1000);
    else meter(who, 'Placement', `${rank.n} / ${RANK_MIN_TRADES} trades`, rank.n / RANK_MIN_TRADES);
    const form = who.createDiv({ cls: 'tvj-lobby-form' });
    form.createSpan({ cls: 'tvj-muted', text: 'Form' });
    for (const t of recent) {
      const r = rMultiple(t);
      form.createSpan({ cls: `tvj-form-chip ${netPnl(t) > 0 ? 'is-win' : netPnl(t) < 0 ? 'is-loss' : ''}`, text: netPnl(t) > 0 ? 'W' : netPnl(t) < 0 ? 'L' : '–', attr: { 'aria-label': `${t.date} ${t.symbol} ${money(netPnl(t))}${r === null ? '' : ` · ${r.toFixed(2)}R`}` } });
    }
    if (!recent.length) form.createSpan({ cls: 'tvj-muted', text: 'no trades yet' });

    const menu = banner.createDiv({ cls: 'tvj-lobby-menu' });
    const item = (label, sub, run, cta) => {
      const b = menu.createEl('button', { cls: `tvj-menu-item ${cta ? 'mod-cta' : ''}` });
      b.createDiv({ cls: 'tvj-menu-label', text: label });
      b.createDiv({ cls: 'tvj-menu-sub', text: sub });
      b.addEventListener('click', run);
    };
    item('New trade', 'Log the trade you just took', () => new NewTradeModal(this.app, this.plugin).open(), true);
    item(pending ? `Review · ${pending}` : 'Review', pending ? 'trades waiting for review' : 'nothing waiting', () => new PendingTradeSuggest(this.app, this.plugin).open());
    item('Dashboard', 'Stats, calendar, simulation', () => this.plugin.openView(VIEW_TYPE));
    item('Profile card', 'Share your rank', () => new ProfileCardModal(this.app, this.plugin, profile).open());

    // member card: the flex card in the design you picked, with the designs your rank has opened beside it
    // between the trader profile and the member card: what the Music pane is playing, with its controls
    // Settings → "Music card in the lobby" (or the card's ×) leaves it out
    // Settings → "Economic calendar in the lobby": this week's news from Forex Factory
    begin('calendar');
    if (this.plugin.source === 'own' && !this.plugin.settings.lobbyCalendarHidden) this.plugin.renderCalendarCard(root, this);
    begin('music');
    if (this.plugin.source === 'own' && !this.plugin.settings.lobbyMusicHidden) this.plugin.renderMusicCard(root, this);
    begin('cards');
    const cardBox = root.createDiv({ cls: 'tvj-card tvj-member' });
    const memberRow = cardBox.createDiv({ cls: 'tvj-member-row' });
    // the cards: the member card and the gym card, one above the other (side by side on a wide pane). Each column
    // starts with a caption of the same height, so the two cards and the designs line up.
    const memberCards = memberRow.createDiv({ cls: 'tvj-member-cards' });
    const memberFig = memberCards.createDiv({ cls: 'tvj-member-fig' });
    memberFig.createDiv({ cls: 'tvj-card-title', text: 'Flex card' });
    const cardButton = memberFig.createEl('button', { cls: 'tvj-member-card', attr: { 'aria-label': 'Open the flex card' } });
    const cardCanvas = cardButton.createEl('canvas');
    cardCanvas.width = CARD_W;
    cardCanvas.height = CARD_H;
    const scopeName = this.scope === 'all' ? 'All accounts' : this.scope.replace(/^(account|group):/, '');
    cardButton.addEventListener('click', () => new FlexCardModal(this.app, this.plugin, this.scope, 'all').open());
    const memberSide = memberRow.createDiv({ cls: 'tvj-member-side' });
    memberSide.createDiv({ cls: 'tvj-muted tvj-member-cap-side', text: VIP ? 'Admin · every design unlocked' : `${unlockedSkins(rank).length} of ${CARD_SKINS.length} designs unlocked` });
    const chosenSkin = this.plugin.renderSkinPicker(memberSide, rank);
    // A moving background plays here too, silent: a YouTube or TikTok video in a frame under a see-through card,
    // or a video file drawn frame by frame.
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const streamed = chosenSkin === 'custom' && !calm ? (settings.cardYouTube || (settings.cardTikTok ? `tiktok:${settings.cardTikTok}` : '')) : '';
    if (streamed) {
      const stage = cardButton.createDiv({ cls: `tvj-flex-stage ${streamed.startsWith('tiktok:') ? 'is-upright' : ''}` });
      streamFrame(stage, streamed);
      stage.appendChild(cardCanvas);
      cardCanvas.addClass('tvj-flex-canvas');
      const own = this.plugin.ownRank();
      drawFlexCard(cardCanvas, trades, scopeName, periodLabel('all', trades), 'money', 'custom', settings.profileName, SEE_THROUGH, undefined, own.ranked ? own.tier : 'Member');
    } else {
      this.plugin.paintCard(cardCanvas, trades, scopeName, periodLabel('all', trades), 'money', chosenSkin).then((picture) => {
        if (calm || !(picture instanceof HTMLVideoElement) || !cardCanvas.isConnected) return;
        const own = this.plugin.ownRank();
        let last = -1;
        const tick = () => {
          if (!cardCanvas.isConnected) { picture.pause(); return; }
          if (picture.currentTime !== last) {
            last = picture.currentTime;
            drawFlexCard(cardCanvas, trades, scopeName, periodLabel('all', trades), 'money', 'custom', settings.profileName, picture, undefined, own.ranked ? own.tier : 'Member');
          }
          window.requestAnimationFrame(tick);
        };
        picture.muted = true;
        picture.play().catch(() => {});
        tick();
      });
    }
    // added last, so its glare lies over a video frame too
    addCardTilt(cardButton);
    this.renderLobbyGymCard(memberCards, calm);
    if (this.plugin.source === 'own') this.plugin.renderCertificates(memberCards);

    // every rank at a glance: one column per tier, divisions I (top) to III, apex tiers as a single badge
    begin('ranks');
    const ranks = root.createDiv({ cls: 'tvj-card' });
    const rh = ranks.createDiv({ cls: 'tvj-card-head' });
    rh.createDiv({ cls: 'tvj-card-title', text: 'Ranks' });
    rh.createDiv({ cls: 'tvj-muted', text: rank.ranked ? `you are ${rank.label} · ${rank.score} RP` : `unranked · ${rank.need} more trade${rank.need === 1 ? '' : 's'}` });
    const board = ranks.createDiv({ cls: 'tvj-ranks' });
    for (const t of TIERS) {
      const col = board.createDiv({ cls: `tvj-ranks-col ${rank.ranked && rank.tier === t.name ? 'is-tier' : ''}` });
      col.style.setProperty('--tvj-tier', t.color);
      col.createDiv({ cls: 'tvj-ranks-name', text: t.name });
      const cells = col.createDiv({ cls: 'tvj-ranks-cells' });
      const cell = (division, size) => {
        const here = rank.ranked && rank.tier === t.name && rank.division === division;
        const reached = rank.ranked && rank.score >= t.from;
        const el = cells.createDiv({ cls: `tvj-ranks-cell ${here ? 'is-here' : ''} ${reached ? 'is-reached' : ''}` });
        el.setAttribute('aria-label', division ? `${t.name} ${division}` : `${t.name} · ${t.from}+ RP`);
        el.appendChild(this.plugin.emblemEl({ ranked: true, tier: t.name, division, apex: !!t.apex, label: division ? `${t.name} ${division}` : t.name }, size, true));
      };
      if (t.apex) cell('', 76);
      else for (const d of [...DIVISIONS].reverse()) cell(d, 56);
      col.createDiv({ cls: 'tvj-tile-sub', text: `${t.from}+` });
    }

    // stat sheet, the way a game profile shows K/D: profit factor first, then money in and out
    const accounts = scopeAccounts(this.scope, this.plugin.allAccounts(allTrades).filter((a) => a !== NO_ACCOUNT), groups);
    const career = careerStats(trades, accounts, settings.accountInfo, settings.payouts);
    begin('career');
    const sheet = root.createDiv({ cls: 'tvj-card' });
    const sheetHead = sheet.createDiv({ cls: 'tvj-card-head' });
    sheetHead.createDiv({ cls: 'tvj-card-title', text: 'Career stats' });
    const sheetTools = sheetHead.createDiv({ cls: 'tvj-options' });
    sheetTools.createEl('button', { text: 'Accounts' }).addEventListener('click', () => new BalancesModal(this.app, this.plugin).open());
    sheetTools.createEl('button', { text: '+ Payout' }).addEventListener('click', () => new PayoutModal(this.app, this.plugin).open());
    const grid = sheet.createDiv({ cls: 'tvj-sheet' });
    const cell = (label, value, sub, cls) => {
      const el = grid.createDiv({ cls: 'tvj-sheet-cell' });
      el.createDiv({ cls: 'tvj-sheet-label', text: label });
      el.createDiv({ cls: `tvj-sheet-value ${cls || ''}`, text: value });
      el.createDiv({ cls: 'tvj-tile-sub', text: sub });
    };
    const signed = (n) => (n < 0 ? 'tvj-neg' : n > 0 ? 'tvj-pos' : '');
    const whole = (n) => money(Math.round(n));
    cell('Profit factor', career.profitFactor === null ? '—' : career.profitFactor.toFixed(2), 'gross win ÷ gross loss', career.profitFactor !== null && career.profitFactor >= 1 ? 'tvj-pos' : career.profitFactor === null ? '' : 'tvj-neg');
    cell('Win rate', `${career.winRate.toFixed(1)}%`, `${career.wins}W · ${career.losses}L`);
    cell('Avg RR', career.rr === null ? '—' : career.rr.toFixed(2), career.rrAccounts > 1 ? `average of ${career.rrAccounts} accounts` : 'average win ÷ average loss', career.rr === null ? '' : career.rr >= 1 ? 'tvj-pos' : 'tvj-neg');
    cell('Balance', career.balance === null ? '—' : whole(career.balance), career.balance === null ? 'set starting balances' : `start ${whole(career.startBalance)} · ${career.balanceAccounts} of ${career.accounts} accounts`);
    cell('Accounts', `${career.activeAccounts} active`, career.blownAccounts ? `${career.blownAccounts} blown` : 'none blown', career.blownAccounts ? 'tvj-neg' : '');
    cell('Payouts', whole(career.payouts), `${career.payoutCount} payout${career.payoutCount === 1 ? '' : 's'}`, career.payouts ? 'tvj-pos' : '');
    cell('Net P&L', whole(career.net), `${career.trades} trades`, signed(career.net));
    cell('Expectancy', whole(career.expectancy), 'average per trade', signed(career.expectancy));
    cell('Best day', career.bestDay ? whole(career.bestDay.pnl) : '—', career.bestDay ? career.bestDay.date : 'no trades', career.bestDay ? signed(career.bestDay.pnl) : '');
    cell('Worst day', career.worstDay ? whole(career.worstDay.pnl) : '—', career.worstDay ? career.worstDay.date : 'no trades', career.worstDay ? signed(career.worstDay.pnl) : '');
    cell('Biggest win', whole(career.biggestWin), `biggest loss ${whole(career.biggestLoss)}`, career.biggestWin ? 'tvj-pos' : '');
    cell('Max drawdown', whole(-career.maxDrawdown), 'from an equity peak', career.maxDrawdown ? 'tvj-neg' : '');

    // activity: a year of days, darker the more was logged (trades journaled + gym sessions)
    begin('activity');
    const activity = activityGrid(trades, gym);
    const heatCard = root.createDiv({ cls: 'tvj-card' });
    const heatHead = heatCard.createDiv({ cls: 'tvj-card-head' });
    heatHead.createDiv({ cls: 'tvj-card-title', text: 'Activity' });
    heatHead.createDiv({ cls: 'tvj-muted', text: `${activity.activeDays} active days in the last year · streak ${activity.streak.cur} · best ${activity.streak.best}` });
    const plural1 = (k, unit) => `${k} ${unit}${k === 1 ? '' : 's'}`;
    this.plugin.renderHeat(heatCard, activity, (day) => (LANG === 'vi'
      ? [day.trades ? `${day.trades} lệnh` : '', day.gym ? `${day.gym} buổi gym` : '']
      : [day.trades ? plural1(day.trades, 'trade') : '', day.gym ? plural1(day.gym, 'gym session') : '']).filter(Boolean).join(', '));

    // streaks: how long each one is, the best so far, and the rank points it is paying
    begin('streaks');
    const sc = root.createDiv({ cls: 'tvj-card' });
    const sch = sc.createDiv({ cls: 'tvj-card-head' });
    sch.createDiv({ cls: 'tvj-card-title', text: 'Streaks' });
    sch.createDiv({ cls: 'tvj-muted', text: `targets: gym ${gymTarget}/week · journal ${journalTarget} days/week` });
    const sg = sc.createDiv({ cls: 'tvj-streaks' });
    const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
    for (const rule of STREAK_RULES) {
      const v = streaks[rule.key];
      const el = sg.createDiv({ cls: `tvj-streak ${v.cur ? 'is-live' : ''}` });
      el.createDiv({ cls: 'tvj-tile-label', text: rule.label });
      const big = el.createDiv({ cls: 'tvj-streak-value' });
      big.createSpan({ text: String(v.cur) });
      big.createSpan({ cls: 'tvj-streak-unit', text: v.cur === 1 ? rule.unit : `${rule.unit}s` });
      el.createDiv({ cls: 'tvj-meter' }).createDiv({ cls: 'tvj-meter-fill' }).style.width = `${Math.round(clamp01(v.cur / rule.fullAt) * 100)}%`;
      el.createDiv({ cls: 'tvj-tile-sub', text: `+${streakPoints(rule, streaks)} / ${rule.max} RP · full at ${rule.fullAt}${rule.key === 'review' ? '' : ` · best ${plural(v.best, rule.unit)}`}` });
      el.createDiv({ cls: 'tvj-tile-sub', text: rule.how });
    }
    const g = sg.createDiv({ cls: `tvj-streak ${streaks.green.cur ? 'is-live' : ''}` });
    g.createDiv({ cls: 'tvj-tile-label', text: 'Green days' });
    const gb = g.createDiv({ cls: 'tvj-streak-value' });
    gb.createSpan({ text: String(streaks.green.cur) });
    gb.createSpan({ cls: 'tvj-streak-unit', text: streaks.green.cur === 1 ? 'day' : 'days' });
    g.createDiv({ cls: 'tvj-tile-sub', text: `best ${plural(streaks.green.best, 'day')} · no rank points` });
    g.createDiv({ cls: 'tvj-tile-sub', text: 'profitable days in a row' });

    begin('points');
    const two = root.createDiv({ cls: 'tvj-grid-2' });

    // where the rank points come from
    const score = two.createDiv({ cls: 'tvj-card' });
    const sh = score.createDiv({ cls: 'tvj-card-head' });
    sh.createDiv({ cls: 'tvj-card-title', text: `Rank points · ${rank.score} / 1000` });
    sh.createDiv({ cls: 'tvj-muted', text: `last ${rank.n} trade${rank.n === 1 ? '' : 's'}` });
    for (const part of rank.parts) {
      const row = score.createDiv({ cls: 'tvj-score-row' });
      const top = row.createDiv({ cls: 'tvj-lobby-meter-top' });
      top.createSpan({ text: part.label });
      if (part.penalty) row.classList.add('is-penalty');
      top.createSpan({ cls: 'tvj-score-points', text: part.penalty ? (part.points ? `−${-part.points}` : '0') : `${part.points} / ${part.max}` });
      row.createDiv({ cls: 'tvj-meter' }).createDiv({ cls: 'tvj-meter-fill' }).style.width = `${Math.round((Math.abs(part.points) / part.max) * 100)}%`;
      row.createDiv({ cls: 'tvj-tile-sub', text: part.detail });
    }
    score.createEl('button', { text: 'See the formula as a tree', cls: 'tvj-link' }).addEventListener('click', () => this.plugin.openView(LOGIC_VIEW_TYPE, 'builtin:rank'));

    // achievements
    const ach = two.createDiv({ cls: 'tvj-card' });
    ach.createDiv({ cls: 'tvj-card-title', text: 'Badges' });
    const badgeGrid = ach.createDiv({ cls: 'tvj-badges' });
    for (const b of badges) {
      const el = badgeGrid.createDiv({ cls: `tvj-badge ${b.done ? 'is-done' : ''}` });
      el.createDiv({ cls: 'tvj-badge-mark', text: b.done ? '★' : '☆' });
      const body = el.createDiv();
      body.createDiv({ cls: 'tvj-badge-name', text: b.name });
      body.createDiv({ cls: 'tvj-tile-sub', text: b.done ? b.how : `${b.how} · ${b.have}/${b.need}` });
    }
    this.arrange(root, starts);
  }

  /** Puts the drawn sections in your order (Customize lobby) and leaves out the hidden ones; the header stays on top. */
  arrange(root, starts) {
    if (this.plugin.source !== 'own') return;
    const kids = [...root.children];
    const parts = new Map(starts.map(([key, at], i) => [key, kids.slice(at, i + 1 < starts.length ? starts[i + 1][1] : kids.length)]));
    for (const key of lobbyOrder(this.plugin.settings.lobbyOrder)) {
      for (const el of parts.get(key) || []) {
        if (lobbyHidden(this.plugin.settings, key)) el.remove();
        else root.appendChild(el);
      }
    }
  }

  async onClose() {
    this.contentEl.empty();
  }
}

