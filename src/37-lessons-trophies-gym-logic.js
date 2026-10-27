// ---------- lessons: study notes drawn in Excalidraw ----------
//
// <folder>/Lessons holds them as ordinary folders and notes, so they stay usable without the plugin:
//   a folder in it            = a subject (the big heading)
//   a folder inside a subject = a chapter (the small heading)
//   a note anywhere in there  = a lesson, drawn in Excalidraw
// Each lesson carries a study mark: to learn, learning or learned.

const LESSON_MARKS = [
  { key: '', label: 'To learn', glyph: '' },
  { key: 'learning', label: 'Learning', glyph: '◐' },
  { key: 'learned', label: 'Learned', glyph: '✓' },
];

class LessonsView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filter = 'all';
    this.folded = new Set();
  }
  getViewType() { return LESSONS_VIEW_TYPE; }
  getDisplayText() { return tx('TrueVision Journal — lessons'); }
  getIcon() { return 'graduation-cap'; }

  async onOpen() {
    this.register(keepLocalized(this.contentEl));
    playEnter(this.contentEl);
    this.render();
    let timer = null;
    const refresh = (file) => {
      if (file && file.path && !file.path.startsWith(this.root())) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => this.render(), 250);
    };
    for (const event of ['create', 'delete', 'rename']) this.registerEvent(this.app.vault.on(event, refresh));
  }

  root() {
    return normalizePath(`${this.plugin.settings.folder}/Lessons`);
  }

  /** Every note in a folder and below it, by name. */
  notesIn(folder, deep) {
    const out = [];
    for (const child of folder.children) {
      if (child instanceof TFile && (child.extension === 'md' || child.extension === 'excalidraw')) out.push(child);
      else if (deep && child instanceof TFolder) out.push(...this.notesIn(child, true));
    }
    return out.sort((a, b) => a.basename.localeCompare(b.basename, undefined, { numeric: true }));
  }

  /** The Lessons folder as { loose, subjects: [{ folder, lessons, chapters: [{ folder, lessons }] }] }. */
  scan() {
    const root = this.app.vault.getAbstractFileByPath(this.root());
    if (!(root instanceof TFolder)) return { loose: [], subjects: [] };
    const folders = (parent) => parent.children.filter((x) => x instanceof TFolder).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return {
      loose: this.notesIn(root, false),
      subjects: folders(root).map((folder) => ({ folder, lessons: this.notesIn(folder, false), chapters: folders(folder).map((chapter) => ({ folder: chapter, lessons: this.notesIn(chapter, true) })) })),
    };
  }

  markOf(file) {
    const key = (this.plugin.settings.lessonStatus || {})[file.path] || '';
    return LESSON_MARKS.find((m) => m.key === key) || LESSON_MARKS[0];
  }

  async setMark(file, key) {
    const marks = { ...(this.plugin.settings.lessonStatus || {}) };
    if (key) marks[file.path] = key; else delete marks[file.path];
    this.plugin.settings.lessonStatus = marks;
    await this.plugin.saveData(this.plugin.settings);
  }

  /** A lesson's name without the ".excalidraw" Excalidraw adds to its notes. */
  nameOf(file) {
    return file.basename.replace(/\.excalidraw$/i, '');
  }

  async addFolder(parent, title) {
    new TextPromptModal(this.app, title, '', async (name) => {
      const path = normalizePath(`${parent}/${safeName(name)}`);
      if (this.app.vault.getAbstractFileByPath(path)) { notify('There is already one with that name.'); return; }
      await this.plugin.ensureFolder(path);
      this.render();
    }).open();
  }

  /** A new lesson: asks its name, makes an empty Excalidraw drawing in `folder` and opens it beside this pane. */
  addLesson(folder) {
    const ea = window.ExcalidrawAutomate;
    if (!ea) { notify('The Excalidraw plugin is needed for lessons — install and enable it first.'); return; }
    new TextPromptModal(this.app, 'Name of the lesson', '', async (name) => {
      await this.plugin.ensureFolder(folder);
      ea.reset();
      const path = await ea.create({ filename: safeName(name), foldername: folder, silent: true });
      const file = path && this.app.vault.getAbstractFileByPath(path);
      this.render();
      if (file instanceof TFile) await this.plugin.openInSide(file);
    }).open();
  }

  rename(item, title) {
    const lesson = item instanceof TFile;
    new TextPromptModal(this.app, title, lesson ? this.nameOf(item) : item.name, async (name) => {
      const tail = lesson ? item.name.slice(this.nameOf(item).length) : ''; // ".excalidraw.md" stays as it is
      const path = normalizePath(`${item.parent.path}/${safeName(name)}${tail}`);
      if (path === item.path) return;
      if (this.app.vault.getAbstractFileByPath(path)) { notify('There is already one with that name.'); return; }
      await this.app.fileManager.renameFile(item, path);
    }).open();
  }

  async remove(item, question) {
    if (!ask(question)) return;
    await this.app.vault.trash(item, true); // to the computer's bin, where it can be taken back
  }

  render() {
    const root = this.contentEl;
    const scrolled = root.scrollTop;
    root.empty();
    root.addClass('tvj-dashboard');
    const head = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(head, LESSONS_VIEW_TYPE);

    const tree = this.scan();
    const all = [...tree.loose, ...tree.subjects.flatMap((s) => [...s.lessons, ...s.chapters.flatMap((ch) => ch.lessons)])];
    const count = (list, key) => list.filter((f) => this.markOf(f).key === key).length;
    const shown = (file) => this.filter === 'all' || this.markOf(file).key === (this.filter === 'new' ? '' : this.filter);

    // the whole of your study at a glance, and the way in
    const top = root.createDiv({ cls: 'tvj-card tvj-lessons-top' });
    const sum = top.createDiv({ cls: 'tvj-lessons-sum' });
    sum.createDiv({ cls: 'tvj-eyebrow', text: 'Lessons' });
    sum.createDiv({ cls: 'tvj-lessons-count', text: `${count(all, 'learned')} / ${all.length}` });
    sum.createDiv({ cls: 'tvj-muted', text: `${tx('lessons learned')} · ${count(all, 'learning')} ${tx('in progress')}` });
    const meter = sum.createDiv({ cls: 'tvj-meter tvj-lessons-meter' });
    meter.createDiv({ cls: 'tvj-meter-fill' }).style.width = `${all.length ? (count(all, 'learned') / all.length) * 100 : 0}%`;
    const tools = top.createDiv({ cls: 'tvj-options' });
    tools.createEl('button', { text: '+ Subject', cls: 'mod-cta' }).addEventListener('click', () => this.addFolder(this.root(), 'Name of the subject'));
    tools.createEl('button', { text: '+ Lesson' }).addEventListener('click', () => this.addLesson(this.root()));
    if (!window.ExcalidrawAutomate) root.createDiv({ cls: 'tvj-card tvj-muted', text: 'Lessons are drawn in Excalidraw. Install and enable the Excalidraw plugin (Settings → Community plugins → Browse → Excalidraw), then come back here.' });

    const tabs = root.createDiv({ cls: 'tvj-tabs' });
    for (const [key, label, n] of [['all', 'All', all.length], ['new', 'To learn', count(all, '')], ['learning', 'Learning', count(all, 'learning')], ['learned', 'Learned', count(all, 'learned')]]) {
      tabs.createEl('button', { cls: `tvj-tab ${this.filter === key ? 'is-active' : ''}`, text: `${tx(label)} · ${n}` }).addEventListener('click', () => { this.filter = key; this.render(); });
    }

    const more = (parent, items) => {
      const b = parent.createEl('button', { cls: 'tvj-lessons-more', text: '⋯', attr: { 'aria-label': 'More' } });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = new Menu();
        for (const [title, icon, run] of items) menu.addItem((item) => item.setTitle(tx(title)).setIcon(icon).onClick(run));
        menu.showAtMouseEvent(e);
      });
    };
    const row = (parent, file) => {
      const mark = this.markOf(file);
      const line = parent.createDiv({ cls: `tvj-lesson is-${mark.key || 'new'}` });
      // the study mark: each press moves it on, to learn → learning → learned → to learn
      const tick = line.createEl('button', { cls: 'tvj-lesson-mark', text: mark.glyph, attr: { 'aria-label': tx(mark.label) } });
      tick.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.setMark(file, LESSON_MARKS[(LESSON_MARKS.indexOf(mark) + 1) % LESSON_MARKS.length].key);
        this.render();
      });
      const name = line.createEl('button', { cls: 'tvj-lesson-name', text: this.nameOf(file) });
      name.addEventListener('click', () => this.plugin.openInSide(file));
      line.createSpan({ cls: 'tvj-lesson-when tvj-muted', text: new Date(file.stat.mtime).toISOString().slice(0, 10) });
      more(line, [
        ['Rename', 'pencil', () => this.rename(file, 'Name of the lesson')],
        ['Delete', 'trash', () => this.remove(file, 'Delete this lesson? It goes to the bin.')],
      ]);
    };
    const rows = (parent, list, hint) => {
      const visible = list.filter(shown);
      for (const file of visible) row(parent, file);
      if (!list.length && hint) parent.createDiv({ cls: 'tvj-lessons-hint tvj-muted', text: hint });
      return visible.length;
    };

    if (tree.loose.filter(shown).length) {
      const card = root.createDiv({ cls: 'tvj-card tvj-lessons-subject' });
      card.createDiv({ cls: 'tvj-card-head' }).createDiv({ cls: 'tvj-card-title', text: 'Without a subject' });
      rows(card, tree.loose);
    }
    for (const subject of tree.subjects) {
      const mine = [...subject.lessons, ...subject.chapters.flatMap((ch) => ch.lessons)];
      if (this.filter !== 'all' && !mine.some(shown)) continue;
      const folded = this.folded.has(subject.folder.path);
      const card = root.createDiv({ cls: `tvj-card tvj-lessons-subject ${folded ? 'is-folded' : ''}` });
      const bar = card.createDiv({ cls: 'tvj-lessons-bar' });
      const title = bar.createEl('button', { cls: 'tvj-lessons-title', attr: { 'aria-expanded': String(!folded) } });
      title.createSpan({ cls: 'tvj-lessons-fold', text: '›' });
      title.createSpan({ text: subject.folder.name });
      title.addEventListener('click', () => { if (folded) this.folded.delete(subject.folder.path); else this.folded.add(subject.folder.path); this.render(); });
      bar.createSpan({ cls: 'tvj-lessons-share tvj-muted', text: `${count(mine, 'learned')} / ${mine.length}` });
      const act = bar.createDiv({ cls: 'tvj-options' });
      act.createEl('button', { text: '+ Lesson' }).addEventListener('click', () => this.addLesson(subject.folder.path));
      act.createEl('button', { text: '+ Chapter' }).addEventListener('click', () => this.addFolder(subject.folder.path, 'Name of the chapter'));
      more(act, [
        ['Rename', 'pencil', () => this.rename(subject.folder, 'Name of the subject')],
        ['Delete', 'trash', () => this.remove(subject.folder, 'Delete this subject and every lesson in it? It goes to the bin.')],
      ]);
      const bar2 = card.createDiv({ cls: 'tvj-meter' });
      bar2.createDiv({ cls: 'tvj-meter-fill' }).style.width = `${mine.length ? (count(mine, 'learned') / mine.length) * 100 : 0}%`;
      if (folded) continue;
      const body = card.createDiv({ cls: 'tvj-lessons-body' });
      rows(body, subject.lessons, subject.chapters.length ? '' : 'No lessons yet. Press "+ Lesson" to draw the first one, or "+ Chapter" to split the subject up.');
      for (const chapter of subject.chapters) {
        if (this.filter !== 'all' && !chapter.lessons.some(shown)) continue;
        const block = body.createDiv({ cls: 'tvj-lessons-chapter' });
        const cbar = block.createDiv({ cls: 'tvj-lessons-bar' });
        cbar.createDiv({ cls: 'tvj-lessons-chapter-title', text: chapter.folder.name });
        cbar.createSpan({ cls: 'tvj-lessons-share tvj-muted', text: `${count(chapter.lessons, 'learned')} / ${chapter.lessons.length}` });
        const cact = cbar.createDiv({ cls: 'tvj-options' });
        cact.createEl('button', { text: '+ Lesson' }).addEventListener('click', () => this.addLesson(chapter.folder.path));
        more(cact, [
          ['Rename', 'pencil', () => this.rename(chapter.folder, 'Name of the chapter')],
          ['Delete', 'trash', () => this.remove(chapter.folder, 'Delete this chapter and every lesson in it? It goes to the bin.')],
        ]);
        rows(block, chapter.lessons, 'No lessons in this chapter yet.');
      }
    }
    if (!tree.subjects.length && !tree.loose.length) {
      const empty = root.createDiv({ cls: 'tvj-card tvj-empty' });
      empty.createEl('h3', { text: 'Your study notes live here' });
      empty.createEl('p', { cls: 'tvj-muted', text: 'Make a subject (the big heading), split it into chapters (the small headings), and draw each lesson in Excalidraw. Mark every lesson as you go: to learn, learning, learned.' });
    }
    root.scrollTop = scrolled;
  }
}

class TrophyView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return TROPHY_VIEW_TYPE; }
  getDisplayText() { return tx('TrueVision Journal — trophies'); }
  getIcon() { return 'trophy'; }

  async onOpen() {
    this.register(keepLocalized(this.contentEl));
    playEnter(this.contentEl);
    this.render();
    this.plugin.watchData(this, () => this.render());
  }

  certFolder() {
    return this.plugin.certificateFolder();
  }

  /** Pictures and PDFs in <journal folder>/Certificates, newest first (the lobby shows the ones you pick). */
  certificates() {
    return this.plugin.certificateFiles();
  }

  /** Copies picked pictures or PDFs into the Certificates folder; the file name (without the date) is the caption. */
  async addCertificates(fileList) {
    await this.plugin.addCertificates(fileList);
    this.render();
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tvj-dashboard');
    const settings = this.plugin.settings;
    const head = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(head, TROPHY_VIEW_TYPE);

    const trades = this.plugin.getTrades().map((x) => x.trade);
    const gym = this.plugin.getGymSessions().map((x) => x.session);
    const streaks = computeStreaks(trades, gym, Math.max(1, Number(settings.gymTarget) || 3), Math.max(1, Number(settings.journalTarget) || 3));
    const accounts = this.plugin.allAccounts(trades).filter((a) => a !== NO_ACCOUNT);
    const rank = computeRank(trades, streaks, { accountInfo: settings.accountInfo, accounts, maxTradesPerDay: settings.maxTradesPerDay });
    const badges = achievements(trades, gym.length, streaks);
    const payouts = [...(settings.payouts || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const funded = accounts.filter((a) => accountKind(a, settings.accountInfo) === 'funded' && !accountStatus(a, trades, settings.accountInfo).blown);

    // the shelf: rank, funded accounts, payouts
    const shelfCard = root.createDiv({ cls: 'tvj-card' });
    const shelfHead = shelfCard.createDiv({ cls: 'tvj-card-head' });
    shelfHead.createDiv({ cls: 'tvj-card-title', text: 'Trophy shelf' });
    shelfHead.createDiv({ cls: 'tvj-muted', text: `${funded.length} funded · ${payouts.length} payout${payouts.length === 1 ? '' : 's'} · ${badges.filter((b) => b.done).length} of ${badges.length} badges` });
    const shelf = shelfCard.createDiv({ cls: 'tvj-shelf' });
    const trophy = (cls, title, sub, art) => {
      const el = shelf.createDiv({ cls: `tvj-trophy ${cls}` });
      const stand = el.createDiv({ cls: 'tvj-trophy-art' });
      if (art) stand.appendChild(art); else stand.innerHTML = CUP_SVG;
      el.createDiv({ cls: 'tvj-trophy-title', text: title });
      el.createDiv({ cls: 'tvj-tile-sub', text: sub });
      return el;
    };
    trophy('is-rank', rank.label, rank.ranked ? `${rank.score} RP` : 'not ranked yet', this.plugin.emblemEl(rank, 64));
    for (const a of funded) trophy('is-funded', a, 'Funded account');
    for (const p of payouts) {
      const cup = trophy('is-payout is-clickable', money(Math.round(payoutReceived(p))), `Payout · ${p.date} · ${p.account}`);
      cup.createDiv({ cls: 'tvj-trophy-link', text: 'View certificate' });
      cup.setAttribute('role', 'button');
      cup.setAttribute('tabindex', '0');
      cup.addEventListener('click', () => new CertificateModal(this.app, this.plugin, p).open());
    }
    if (!funded.length && !payouts.length) shelfCard.createEl('p', { cls: 'tvj-muted', text: 'Funded accounts and payouts appear here as cups. Add a payout from the lobby, or set an account to Funded.' });

    // certificates: your own pictures
    const certCard = root.createDiv({ cls: 'tvj-card' });
    const certHead = certCard.createDiv({ cls: 'tvj-card-head' });
    certHead.createDiv({ cls: 'tvj-card-title', text: 'Certificates' });
    const own = this.plugin.source === 'own';
    const files = own ? this.certificates() : [];
    if (own) {
      const input = certHead.createEl('input', { attr: { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf', multiple: 'true', hidden: 'true' } });
      input.addEventListener('change', () => this.addCertificates(input.files));
      certHead.createEl('button', { text: 'Add certificate', cls: 'mod-cta' }).addEventListener('click', () => input.click());
    }
    // payout certificates counted on the total of every payout received
    if (own) {
      const m = payoutMilestones(settings.payouts);
      const row = certCard.createDiv({ cls: 'tvj-milestones' });
      const tile = (cls, big, small, sub, open) => {
        const el = row.createEl('button', { cls: `tvj-milestone ${cls}` });
        el.createDiv({ cls: 'tvj-milestone-big', text: big });
        el.createDiv({ cls: 'tvj-milestone-small', text: small });
        el.createDiv({ cls: 'tvj-tile-sub', text: sub });
        if (open) el.addEventListener('click', open); else el.disabled = true;
      };
      const totalCert = (amount, date, count, sub, heading) => new CertificateModal(this.app, this.plugin, {
        id: `${String(date).replace(/-/g, '')}${Math.round(amount)}`, date, account: `${tx('All accounts')} · ${count} ${tx(count === 1 ? 'payout' : 'payouts')}`,
        pill: `${tx('ALL ACCOUNTS')} · ${count} ${tx(count === 1 ? 'PAYOUT' : 'PAYOUTS')}`,
        received: amount, amount, titleSub: sub, heading }).open();
      tile('is-total', money(Math.round(m.total)), tx('TOTAL PAYOUT'), m.count ? `${m.count} ${tx(m.count === 1 ? 'payout' : 'payouts')}` : tx('no payouts yet'),
        m.count ? () => totalCert(m.total, m.last, m.count, 'TOTAL PAYOUT', 'Total payout certificate') : null);
      for (const step of PAYOUT_MILESTONES) {
        const got = m.reached[step];
        tile(got ? 'is-done' : 'is-locked', shortMoney(step), tx('MILESTONE'), got ? got.date : `${money(Math.ceil(step - m.total))} ${tx('to go')}`,
          got ? () => totalCert(got.total, got.date, got.count, `${shortMoney(step)} ${tx('PAYOUT MILESTONE')}`, `${shortMoney(step)} ${tx('milestone')}`) : null);
      }
    }
    const wall = certCard.createDiv({ cls: 'tvj-certs' });
    if (own) {
      // pictures can also be dropped onto the wall
      wall.addEventListener('dragover', (e) => { e.preventDefault(); wall.classList.add('is-drop'); });
      wall.addEventListener('dragleave', () => wall.classList.remove('is-drop'));
      wall.addEventListener('drop', (e) => { e.preventDefault(); wall.classList.remove('is-drop'); this.addCertificates(e.dataTransfer && e.dataTransfer.files); });
    }
    if (!files.length) wall.createDiv({ cls: 'tvj-certs-empty tvj-muted', text: own ? 'No certificates yet. Add a picture of a payout or funded certificate, or drop it here.' : 'Certificates are not part of a review package.' });
    for (const file of files) {
      const card = wall.createDiv({ cls: 'tvj-cert' });
      const title = file.basename.replace(/^\d{4}-\d{2}-\d{2} /, '');
      const frame = card.createEl('button', { cls: 'tvj-cert-frame', attr: { 'aria-label': `Open ${title}` } });
      this.plugin.certificateThumb(frame, file); // a PDF shows its first page
      frame.addEventListener('click', () => this.plugin.openInSide(file));
      const foot = card.createDiv({ cls: 'tvj-cert-foot' });
      const text = foot.createDiv();
      text.createDiv({ cls: 'tvj-cert-title', text: title });
      text.createDiv({ cls: 'tvj-tile-sub', text: (file.basename.match(/^\d{4}-\d{2}-\d{2}/) || [''])[0] });
      const tools = foot.createDiv({ cls: 'tvj-options' });
      tools.createEl('button', { text: '✎', attr: { 'aria-label': 'Rename' } }).addEventListener('click', () => {
        new TextPromptModal(this.app, 'Certificate title', title, async (value) => {
          const next = safeName(String(value || '').trim());
          if (!next || next === title) return;
          const date = (file.basename.match(/^\d{4}-\d{2}-\d{2} /) || [''])[0];
          const target = normalizePath(`${this.certFolder()}/${date}${next}.${file.extension}`);
          if (this.app.vault.getAbstractFileByPath(target)) { notify('A certificate with this title already exists.'); return; }
          await this.app.fileManager.renameFile(file, target);
          this.render();
        }).open();
      });
      tools.createEl('button', { text: '×', attr: { 'aria-label': 'Delete' } }).addEventListener('click', async () => {
        if (!ask(`Delete the certificate "${title}"? The picture goes to the trash.`)) return;
        await this.app.vault.trash(file, true);
        this.render();
      });
    }

    // certificate skins: three open with each rank; picking one opens the newest payout's certificate in it
    if (own) {
      renderCertSkins(root.createDiv({ cls: 'tvj-card' }), this.plugin, rank, settings.certSkin || 'classic', async (key) => {
        settings.certSkin = key;
        await this.plugin.saveData(settings);
        this.render();
        if (payouts[0]) new CertificateModal(this.app, this.plugin, payouts[0]).open();
      });
    }

    // badges, the same ones the lobby lists
    const badgeCard = root.createDiv({ cls: 'tvj-card' });
    badgeCard.createDiv({ cls: 'tvj-card-title', text: 'Badges' });
    const grid = badgeCard.createDiv({ cls: 'tvj-badges' });
    for (const b of badges) {
      const el = grid.createDiv({ cls: `tvj-badge ${b.done ? 'is-done' : ''}` });
      el.createDiv({ cls: 'tvj-badge-mark', text: b.done ? '★' : '☆' });
      const body = el.createDiv();
      body.createDiv({ cls: 'tvj-badge-name', text: b.name });
      body.createDiv({ cls: 'tvj-tile-sub', text: b.done ? b.how : `${b.how} · ${b.have}/${b.need}` });
    }
  }

  async onClose() {
    this.contentEl.empty();
  }
}

class TextPromptModal extends ThemedModal {
  constructor(app, title, initial, onSubmit) {
    super(app);
    this.title = title;
    this.value = initial || '';
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: this.title });
    const input = contentEl.createEl('input', { type: 'text', cls: 'tvj-prompt', value: this.value });
    const submit = () => {
      const v = input.value.trim();
      if (!v) return;
      this.close();
      this.onSubmit(v);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    contentEl.createDiv({ cls: 'tvj-options' }).createEl('button', { text: 'OK', cls: 'mod-cta' }).addEventListener('click', submit);
    window.setTimeout(() => { input.focus(); input.select(); }, 0);
  }
  onClose() {
    this.contentEl.empty();
  }
}

class LogGymModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.f = { date: isoDay(new Date()), kind: GYM_KINDS[0], minutes: '60', exercises: '', notes: '' };
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Log a gym session');
    new Setting(contentEl).setName('Date').addText((c) => c.setPlaceholder('YYYY-MM-DD').setValue(this.f.date).onChange((v) => { this.f.date = v; }));
    new Setting(contentEl).setName('Session').addDropdown((d) => {
      for (const k of GYM_KINDS) d.addOption(k, k);
      d.setValue(this.f.kind).onChange((v) => { this.f.kind = v; });
    });
    new Setting(contentEl).setName('Minutes').addText((c) => c.setValue(this.f.minutes).onChange((v) => { this.f.minutes = v; }));
    new Setting(contentEl)
      .setName('Exercises')
      .setDesc('One per line: name, sets x reps, weight. Example: Bench press 4x8 60')
      .addTextArea((c) => {
        c.inputEl.rows = 6;
        c.inputEl.cols = 32;
        c.setPlaceholder('Bench press 4x8 60\nIncline dumbbell press 3x10 22.5\nPlank 3x60').onChange((v) => { this.f.exercises = v; });
      });
    new Setting(contentEl).setName('Notes').addTextArea((c) => c.onChange((v) => { this.f.notes = v; }));
    new Setting(contentEl).addButton((b) => b.setButtonText('Save session').setCta().onClick(() => this.save()));
  }
  async save() {
    const f = this.f;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date.trim())) {
      notify('Date must be YYYY-MM-DD.');
      return;
    }
    const lines = f.exercises.split('\n').map((l) => l.trim()).filter(Boolean);
    const unread = lines.filter((l) => !parseExercise(l));
    const file = await this.plugin.createGymNote({
      date: f.date.trim(), kind: f.kind, minutes: Number.isFinite(Number(f.minutes)) ? Number(f.minutes) : 0, lines, notes: f.notes.trim(),
    });
    if (!file) return;
    notify(unread.length ? `Session saved. ${unread.length} line(s) are kept as text but not counted (write them as "name 4x8 60").` : 'Session saved.');
    this.close();
    // the session is done: show its card straight away, ready to copy or save
    const date = f.date.trim();
    new GymCardModal(this.app, this.plugin, { date, kind: f.kind, minutes: Number.isFinite(Number(f.minutes)) ? Number(f.minutes) : 0, exercises: lines.map(parseExercise).filter(Boolean), lines }).open();
  }
  onClose() {
    this.contentEl.empty();
  }
}

class GymView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.month = null;
  }
  getViewType() { return GYM_VIEW_TYPE; }
  getDisplayText() { return tx('TrueVision Journal — gym'); }
  getIcon() { return 'dumbbell'; }

  async onOpen() {
    this.register(keepLocalized(this.contentEl));
    playEnter(this.contentEl);
    this.render();
    this.plugin.watchData(this, () => this.render());
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tvj-dashboard');
    const items = this.plugin.getGymSessions();
    const sessions = items.map((x) => x.session);
    const target = Math.max(1, Number(this.plugin.settings.gymTarget) || 3);

    const head = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(head, GYM_VIEW_TYPE);
    const gymActions = head.createDiv({ cls: 'tvj-options' });
    gymActions.createEl('button', { text: 'Log session', cls: 'mod-cta' }).addEventListener('click', () => new LogGymModal(this.app, this.plugin).open());
    gymActions.createEl('button', { text: 'Gym card' }).addEventListener('click', () => new GymCardModal(this.app, this.plugin).open());

    if (!sessions.length) {
      const empty = root.createDiv({ cls: 'tvj-card tvj-empty' });
      empty.createEl('h3', { text: 'No gym sessions yet' });
      empty.createEl('p', { cls: 'tvj-muted', text: 'Log a session to start tracking your weekly target, streak and best lifts.' });
      return;
    }

    const st = gymStats(sessions, target);
    const tiles = root.createDiv({ cls: 'tvj-tiles' });
    const tile = (label, value, sub, bar) => {
      const el = tiles.createDiv({ cls: 'tvj-tile' });
      el.createDiv({ cls: 'tvj-tile-label', text: label });
      el.createDiv({ cls: 'tvj-tile-value', text: value });
      if (bar !== undefined) el.createDiv({ cls: 'tvj-meter' }).createDiv({ cls: 'tvj-meter-fill' }).style.width = `${Math.max(0, Math.min(100, bar))}%`;
      el.createDiv({ cls: 'tvj-tile-sub', text: sub });
    };
    tile('This week', `${st.week} / ${target}`, st.week >= target ? 'weekly target met' : `${target - st.week} more to hit the target`, (st.week / target) * 100);
    tile('Week streak', String(st.streak), st.streak === 1 ? 'week on target' : 'weeks in a row on target');
    tile('This month', String(st.month), 'sessions');
    tile('Time this month', `${Math.floor(st.minutes / 60)}h ${st.minutes % 60}m`, 'training time');

    // the year at a glance: one square per day, darker the longer the session
    const year = gymGrid(sessions);
    const heatCard = root.createDiv({ cls: 'tvj-card' });
    const heatHead = heatCard.createDiv({ cls: 'tvj-card-head' });
    heatHead.createDiv({ cls: 'tvj-card-title', text: 'Training days' });
    heatHead.createDiv({ cls: 'tvj-muted', text: `${year.activeDays} training days in the last year` });
    this.plugin.renderHeat(heatCard, year, (day) => (day.gym ? (LANG === 'vi' ? `${day.gym} buổi · ${day.minutes} phút` : `${day.gym} session${day.gym === 1 ? '' : 's'} · ${day.minutes} min`) : ''));

    // month calendar: which days were trained
    const byDay = new Map(sessions.map((g) => [g.date, g]));
    const latest = [...byDay.keys()].sort().pop();
    const month = this.month || latest.slice(0, 7);
    const cal = root.createDiv({ cls: 'tvj-card' });
    const ch = cal.createDiv({ cls: 'tvj-cal-head' });
    ch.createDiv({ cls: 'tvj-card-title', text: `Training days · ${month}` });
    const nav = ch.createDiv({ cls: 'tvj-options' });
    nav.createEl('button', { text: '‹', attr: { 'aria-label': 'Previous month' } }).addEventListener('click', () => { this.month = shiftMonth(month, -1); this.render(); });
    nav.createEl('button', { text: '›', attr: { 'aria-label': 'Next month' } }).addEventListener('click', () => { this.month = shiftMonth(month, 1); this.render(); });
    const grid = cal.createDiv({ cls: 'tvj-cal tvj-cal-7' });
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) grid.createDiv({ cls: 'tvj-cal-dow', text: d });
    for (const week of monthGrid(month)) {
      for (const d of week) {
        const g = d ? byDay.get(d) : null;
        const cell = grid.createDiv({ cls: `tvj-cal-day tvj-gym-day ${d ? '' : 'is-out'} ${g ? 'is-done' : ''}` });
        if (d) cell.createDiv({ cls: 'tvj-cal-num', text: String(Number(d.slice(8))) });
        if (g) {
          cell.createDiv({ cls: 'tvj-cal-pnl', text: g.kind });
          if (g.minutes) cell.createDiv({ cls: 'tvj-cal-count', text: `${g.minutes} min` });
        }
      }
    }

    const two = root.createDiv({ cls: 'tvj-grid-2' });
    const prCard = two.createDiv({ cls: 'tvj-card' });
    prCard.createDiv({ cls: 'tvj-card-title', text: 'Best lifts' });
    const records = gymRecords(sessions);
    if (!records.length) prCard.createEl('p', { cls: 'tvj-muted', text: 'Write exercises as "Bench press 4x8 60" to track your best lifts.' });
    else {
      const table = prCard.createEl('table', { cls: 'tvj-table' });
      const hr = table.createEl('thead').createEl('tr');
      for (const h of ['Exercise', 'Best', 'On', 'Times']) hr.createEl('th', { text: h });
      const body = table.createEl('tbody');
      for (const r of records.slice(0, 12)) {
        const tr = body.createEl('tr');
        tr.createEl('td', { text: r.name });
        tr.createEl('td', { text: `${r.sets}×${r.reps}${r.weight === null ? '' : ` @ ${r.weight}`}` });
        tr.createEl('td', { text: r.date });
        tr.createEl('td', { text: String(r.count) });
      }
    }

    const logCard = two.createDiv({ cls: 'tvj-card' });
    logCard.createDiv({ cls: 'tvj-card-title', text: 'Recent sessions' });
    const list = logCard.createDiv({ cls: 'tvj-list' });
    for (const x of [...items].sort((a, b) => b.session.date.localeCompare(a.session.date)).slice(0, 10)) {
      const g = x.session;
      const row = list.createDiv({ cls: 'tvj-row' });
      row.createSpan({ text: `${g.date} · ${g.kind}` });
      const right = row.createSpan();
      right.createSpan({ cls: 'tvj-muted', text: `${g.lines.length} exercises${g.minutes ? ` · ${g.minutes} min` : ''} ` });
      right.createEl('button', { text: 'Card', attr: { 'aria-label': 'Card of this session' } }).addEventListener('click', (e) => {
        e.stopPropagation();
        new GymCardModal(this.app, this.plugin, g).open();
      });
      row.addEventListener('click', () => this.plugin.openInSide(x.file));
    }
  }

  async onClose() {
    this.contentEl.empty();
  }
}

/** A sketch board for decision logic: a nested bullet list in a note, drawn as a left-to-right tree. */
class LogicView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.current = plugin.pendingLogic || null; // file path, or 'builtin:loss' / 'builtin:win' / 'builtin:rank'
  }
  getViewType() { return LOGIC_VIEW_TYPE; }
  getDisplayText() { return tx('TrueVision Journal — logic tree'); }
  getIcon() { return 'git-fork'; }

  async onOpen() {
    this.register(keepLocalized(this.contentEl));
    playEnter(this.contentEl);
    await this.render();
  }

  logicFiles() {
    const folder = `${normalizePath(`${this.plugin.settings.folder}/Logic`)}/`;
    return this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder)).sort((a, b) => a.basename.localeCompare(b.basename));
  }

  async render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tvj-dashboard');
    const files = this.logicFiles();
    if (!this.current) this.current = files.length ? files[0].path : 'builtin:loss';
    const file = files.find((f) => f.path === this.current);
    if (!file && !this.current.startsWith('builtin:')) this.current = files.length ? files[0].path : 'builtin:loss';
    const editable = !!file;

    const head = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(head, LOGIC_VIEW_TYPE);
    const actions = head.createDiv({ cls: 'tvj-options' });
    actions.createEl('button', { text: 'New tree', cls: 'mod-cta' }).addEventListener('click', () => {
      new TextPromptModal(this.app, 'Name of the new tree', 'Entry checklist', async (name) => {
        const created = await this.plugin.createLogicNote(name);
        if (created) { this.current = created.path; this.render(); }
      }).open();
    });
    if (file) actions.createEl('button', { text: 'Open note' }).addEventListener('click', () => this.plugin.openInSide(file));

    const filters = root.createDiv({ cls: 'tvj-filters' });
    const select = filters.createEl('select', { cls: 'dropdown' });
    for (const f of files) select.createEl('option', { text: f.basename, value: f.path });
    select.createEl('option', { text: 'Review questions — losing trade', value: 'builtin:loss' });
    select.createEl('option', { text: 'Review questions — winning trade', value: 'builtin:win' });
    select.createEl('option', { text: 'How rank points are calculated', value: 'builtin:rank' });
    select.value = this.current;
    select.addEventListener('change', () => { this.current = select.value; this.render(); });
    filters.createSpan({
      cls: 'tvj-muted',
      text: editable && Object.values(OWN_REVIEW_TREES).includes(file.basename) ? 'Your trade reviews ask these questions (they replace the built-in ones). A box ending in ? is a question, the boxes under it its answers; a question with nothing under it is written out.'
        : editable ? 'Hover a box: + adds a branch, ✎ renames, × deletes it with its branches. The tree is a bullet list in the note.' : 'Read-only: this is logic built into the plugin. Make your own with "New tree".',
    });

    const roots = editable
      ? parseOutline(await this.app.vault.cachedRead(file))
      : this.current === 'builtin:rank' ? rankTree() : reviewTree(this.current === 'builtin:win' ? WIN_REVIEW : LOSS_REVIEW, this.current === 'builtin:win' ? 'Winning trade' : 'Losing trade');
    const save = async () => {
      await this.app.vault.modify(file, outlineToMarkdown(roots));
      this.render();
    };

    const board = root.createDiv({ cls: 'tvj-card tvj-tree-board' });
    if (!roots.length) {
      board.createEl('p', { cls: 'tvj-muted', text: 'This tree is empty.' });
      board.createEl('button', { text: 'Add the first box' }).addEventListener('click', () => {
        new TextPromptModal(this.app, 'First box', '', (text) => { roots.push({ text, children: [] }); save(); }).open();
      });
      return;
    }

    const NODE_W = 200, NODE_H = 52, GAP_X = 56, GAP_Y = 14;
    const layout = layoutTree(roots);
    const width = layout.depth * NODE_W + (layout.depth - 1) * GAP_X;
    const height = layout.rows * NODE_H + (layout.rows - 1) * GAP_Y;
    const canvas = board.createDiv({ cls: 'tvj-tree' });
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const nx = (n) => n.depth * (NODE_W + GAP_X);
    const ny = (n) => n.row * (NODE_H + GAP_Y);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('class', 'tvj-tree-links');
    for (const n of layout.nodes) {
      if (!n.parent) continue;
      const x1 = nx(n.parent) + NODE_W, y1 = ny(n.parent) + NODE_H / 2, x2 = nx(n), y2 = ny(n) + NODE_H / 2;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M${x1},${y1} C${x1 + GAP_X / 2},${y1} ${x2 - GAP_X / 2},${y2} ${x2},${y2}`);
      svg.appendChild(path);
    }
    canvas.appendChild(svg);
    for (const n of layout.nodes) {
      const el = canvas.createDiv({ cls: `tvj-node tvj-depth-${n.depth % 4} ${n.node.children.length ? '' : 'is-leaf'}` });
      el.style.left = `${nx(n)}px`;
      el.style.top = `${ny(n)}px`;
      el.style.width = `${NODE_W}px`;
      el.style.height = `${NODE_H}px`;
      el.setAttribute('title', n.node.text);
      el.createDiv({ cls: 'tvj-node-text', text: n.node.text });
      if (!editable) continue;
      const tools = el.createDiv({ cls: 'tvj-node-tools' });
      tools.createEl('button', { text: '+', attr: { 'aria-label': 'Add a branch' } }).addEventListener('click', () => {
        new TextPromptModal(this.app, `New branch under "${n.node.text}"`, '', (text) => { n.node.children.push({ text, children: [] }); save(); }).open();
      });
      tools.createEl('button', { text: '✎', attr: { 'aria-label': 'Rename' } }).addEventListener('click', () => {
        new TextPromptModal(this.app, 'Rename', n.node.text, (text) => { n.node.text = text; save(); }).open();
      });
      tools.createEl('button', { text: '×', attr: { 'aria-label': 'Delete with its branches' } }).addEventListener('click', () => {
        const count = layoutTree([n.node]).nodes.length - 1;
        if (count && !ask(`Delete "${n.node.text}" and its ${count} branch box(es)?`)) return;
        const siblings = n.parent ? n.parent.node.children : roots;
        siblings.splice(siblings.indexOf(n.node), 1);
        save();
      });
    }
  }

  async onClose() {
    this.contentEl.empty();
  }
}

/** Only http(s) links are handed to yt-dlp. */
function isVideoUrl(text) {
  try { return /^https?:$/.test(new URL(text).protocol); } catch (e) { return false; }
}

/** The yt-dlp arguments for one video saved into `dir` (as `name`, a yt-dlp file name pattern); the last line it
 *  prints is the saved file's path. The sharpest picture there is wins (4K where the video has it); at the same
 *  size H.264 with AAC, which every player reads. File names are kept ASCII (--restrict-filenames) so that the
 *  printed path reads correctly whatever the Windows codepage. */
function ytArgs(url, dir, format, name) {
  return ['-P', dir, '-o', name || '%(title).60s-%(id)s.%(ext)s', '-f', format, '-S', 'res,vcodec:h264,acodec:aac', '--merge-output-format', 'mp4',
    '--restrict-filenames', '--no-playlist', '--print', 'after_move:filepath', '--', url]; // "--": a link can never be read as an option
}

/** The address of a stored streamed background ('<YouTube id>' or 'tiktok:<id>'), for downloading it. */
function streamLink(stored) {
  return String(stored).startsWith('tiktok:') ? `https://www.tiktok.com/@/video/${String(stored).slice(7)}` : `https://www.youtube.com/watch?v=${stored}`;
}

/** Save video over a video playing in a frame, on a computer with yt-dlp: the video is downloaded and becomes the
 *  card's video file, as if it had been uploaded (`take(picked)` stores it; left out, it is the flex card's), and
 *  `after()` draws the dialog again. Where it cannot be downloaded the card is recorded, as before. */
function downloadOnSave(plugin, source, link, take, after) {
  if (!canRunTools(plugin.app)) return source;
  source.fetch = async () => {
    if (!await plugin.cardVideoFromLink(link, take)) return false;
    after();
    notify('The video was downloaded and is now the card\'s video. Press Save video again to save it.');
    return true;
  };
  return source;
}

/** What to say when a background link is neither YouTube's nor TikTok's: nothing more on a computer, where the
 *  download was tried and said why it failed (Instagram and the other sites go through yt-dlp); elsewhere, that
 *  only those two work there. */
function notOnYouTube(app, link) {
  if (canRunTools(app) && isVideoUrl(String(link || '').trim())) return;
  notify(isVideoUrl(String(link || '').trim()) ? 'Only YouTube and TikTok links work here: videos from other sites (Instagram…) need yt-dlp, on a computer.' : 'That is not a YouTube video link.');
}

/** Whether command-line tools (yt-dlp, ffmpeg) can be run here: Obsidian on a computer, not on a phone. */
function canRunTools(app) {
  return typeof window.require === 'function' && typeof app.vault.adapter.getFullPath === 'function';
}

/** A PATH for running tools on a Mac or Linux: the given one, then where Homebrew and pip put programs. */
function toolPath(path, home) {
  return [path, '/opt/homebrew/bin', '/usr/local/bin', home && `${home}/.local/bin`].filter(Boolean).join(':');
}

/** Runs a command-line tool; resolves to { ok, out, err, missing } (`missing`: there is no such program).
 *  `told(text)` gets what it writes about its progress as it goes. */
function runTool(binary, args, told) {
  return new Promise((resolve) => {
    // An app started from the Dock on a Mac (or a launcher on Linux) is not given the shell's PATH, so the folders
    // Homebrew and pip install into are added: the tool is found, and yt-dlp finds ffmpeg in turn.
    const env = process.platform === 'win32' ? process.env : { ...process.env, PATH: toolPath(process.env.PATH, process.env.HOME) };
    const proc = window.require('child_process').spawn(binary, args, { windowsHide: true, env });
    let out = '', err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err = (err + d).slice(-4000); if (told) told(String(d)); });
    proc.on('error', (e) => resolve({ ok: false, missing: e.code === 'ENOENT', out, err: e.message }));
    proc.on('close', (code) => resolve({ ok: code === 0, out, err }));
  });
}

/** The size a card is rendered at over a video of sw x sh: the card's shape cut from the video's middle, as sharp
 *  as the video itself (4K stays 4K) and never smaller than 1920 x 1080. Even numbers, as video encoders ask. */
function renderSize(sw, sh) {
  const wide = sw * CARD_H >= sh * CARD_W;
  const h = Math.max(1080, wide ? sh : sw * CARD_H / CARD_W);
  const even = (v) => Math.round(v / 2) * 2;
  return [even(h * CARD_W / CARD_H), even(h)];
}

/** Whether what ffmpeg says about a file (`ffmpeg -i file`) names an H.265 picture. */
function isH265(report) {
  return /Video: (hevc|h265)/i.test(String(report));
}

/** The ffmpeg arguments that write `source` again as H.264 with AAC sound, at the same size. */
function h264Args(source, out) {
  return ['-y', '-i', source, '-c:v', 'libx264', '-crf', '21', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out];
}

/** The ffmpeg arguments that lay the see-through card picture `sheet` (w x h) over the video file `source` and
 *  write `out`: the whole video with its own sound, nothing recorded from the screen. With `rate`, `sheet` is a
 *  numbered run of pictures (the numbers counting up) played at that many a second; the last one stays on. */
function ffmpegArgs(source, sheet, out, w, h, rate) {
  return ['-y', '-i', source, ...(rate ? ['-framerate', String(rate)] : []), '-i', sheet,
    '-filter_complex', `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}[v];[v][1:v]overlay=format=auto[o]`,
    '-map', '[o]', '-map', '0:a?', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', out];
}

class VideoModal extends ThemedModal {
  constructor(app, plugin, initial) {
    super(app);
    this.plugin = plugin;
    this.initial = initial;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: tx('Download video (TikTok / YouTube)') });
    let url = this.initial;
    const go = () => { this.close(); this.plugin.downloadVideo(url.trim()); };
    new Setting(contentEl).setName(tx('Link')).addText((c) => {
      c.setValue(url).onChange((v) => { url = v; });
      c.inputEl.style.width = '100%';
      c.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
    new Setting(contentEl).addButton((b) => b.setButtonText(tx('Download')).setCta().onClick(go));
  }
  onClose() {
    this.contentEl.empty();
  }
}

