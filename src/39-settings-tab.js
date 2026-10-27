class JournalSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName('Language').setDesc("Language of the plugin's screens.").addDropdown((d) => {
      d.addOption('auto', 'Auto (Obsidian language)').addOption('en', 'English').addOption('vi', 'Tiếng Việt');
      d.setValue(this.plugin.settings.language).onChange(async (v) => {
        this.plugin.settings.language = v;
        await this.plugin.saveData(this.plugin.settings);
        this.plugin.applyLanguage();
        this.plugin.refreshViews();
        this.display();
      });
    });
    new Setting(containerEl).setName('Welcome guide').setDesc('The five steps a first install starts with: language, your name, a first account, getting trades in, and where things are.')
      .addButton((b) => b.setButtonText('Show').onClick(() => new WelcomeGuideModal(this.app, this.plugin).open()));
    new Setting(containerEl).setName('Theme and colours').setDesc('The journal\'s theme, win and loss colours, accent, background picture or video, and the Monkeytype themes.')
      .addButton((b) => b.setButtonText('Open').setCta().onClick(() => new StyleModal(this.app, this.plugin).open()));
    new Setting(containerEl).setName('GIF and video length')
      .setDesc('How long Export GIF and Export video run on the cards. A longer GIF is made a little smaller so it stays about 10 MB, small enough to post on Discord.')
      .addDropdown((d) => {
        for (const n of CLIP_LENGTHS) d.addOption(String(n), LANG === 'vi' ? `${n} giây` : `${n} seconds`);
        d.setValue(String(clipSeconds(this.plugin.settings))).onChange(async (v) => {
          this.plugin.settings.clipSeconds = Number(v);
          await this.plugin.saveData(this.plugin.settings);
        });
      });
    new Setting(containerEl).setName('Hide breached accounts in pickers')
      .setDesc('Leaves accounts marked breached out of the account dropdowns (lobby, dashboard, journal, import, payouts). Their trades still count in the totals, and the Accounts screen still lists them.')
      .addToggle((c) => c.setValue(this.plugin.settings.hideBreached !== false).onChange(async (v) => {
        this.plugin.settings.hideBreached = v;
        await this.plugin.saveData(this.plugin.settings);
        this.plugin.refreshViews();
      }));
    new Setting(containerEl).setName('Hide passed evaluations in pickers')
      .setDesc('Leaves evaluations you passed (and advanced to the next step) out of the same dropdowns. Their trades still count, and the Accounts screen lists them under Show passed and breached.')
      .addToggle((c) => c.setValue(this.plugin.settings.hidePassed !== false).onChange(async (v) => {
        this.plugin.settings.hidePassed = v;
        await this.plugin.saveData(this.plugin.settings);
        this.plugin.refreshViews();
      }));
    new Setting(containerEl).setName('Trade overview in trade notes')
      .setDesc('A small card at the top of each trade note (side, P&L, entry, exit, account, setups) in place of its list of properties. The properties are one click away.')
      .addToggle((c) => c.setValue(this.plugin.settings.tradeOverview !== false).onChange(async (v) => {
        this.plugin.settings.tradeOverview = v;
        await this.plugin.saveData(this.plugin.settings);
        this.plugin.decorateTradeNotes();
      }));
    new Setting(containerEl).setName('Open screens in')
      .setDesc('Where the lobby, journal, accounts and the other screens open. A screen that is already open is brought forward either way.')
      .addDropdown((d) => {
        d.addOption('tab', 'A new tab').addOption('current', 'The current tab');
        d.setValue(this.plugin.settings.openIn === 'current' ? 'current' : 'tab').onChange(async (v) => {
          this.plugin.settings.openIn = v;
          await this.plugin.saveData(this.plugin.settings);
        });
      });
    new Setting(containerEl)
      .setName('Journal folder')
      .setDesc('New trade notes are created in <folder>/Trades. Trade notes anywhere in the vault are still counted.')
      .addText((c) => c.setValue(this.plugin.settings.folder).onChange(async (v) => {
        this.plugin.settings.folder = v.trim() || DEFAULT_SETTINGS.folder;
        await this.plugin.saveData(this.plugin.settings);
      }));
    new Setting(containerEl)
      .setName('Rank pictures')
      .setDesc(`To use your own picture for a tier, put it in "${this.plugin.settings.folder}/Ranks/" named after the tier: iron, bronze, silver, gold, platinum, emerald, diamond, master, grandmaster, challenger, unranked (.png, .webp, .jpg or .svg). Tiers without a picture use the built-in crest.`);
    new Setting(containerEl).setName('Profile name').setDesc('Shown on the lobby and the profile card.').addText((c) => c.setValue(this.plugin.settings.profileName).onChange(async (v) => {
      this.plugin.settings.profileName = v.trim() || 'Trader';
      await this.plugin.saveData(this.plugin.settings);
      this.plugin.refreshViews();
    }));
    new Setting(containerEl).setName('Verified tick').setDesc('Shows a blue tick after your name on the profile card.').addToggle((c) => c.setValue(!!this.plugin.settings.profileVerified).onChange(async (v) => {
      this.plugin.settings.profileVerified = v;
      await this.plugin.saveData(this.plugin.settings);
      this.plugin.refreshViews();
    }));
    new Setting(containerEl).setName('Profile tagline').setDesc('Optional line under the name, e.g. "NQ · opening range".').addText((c) => c.setValue(this.plugin.settings.profileTag).onChange(async (v) => {
      this.plugin.settings.profileTag = v.trim();
      await this.plugin.saveData(this.plugin.settings);
      this.plugin.refreshViews();
    }));
    new Setting(containerEl)
      .setName('Max trades per day')
      .setDesc('Days with more trades than this count as overtrading and cost rank points. 0 turns the rule off.')
      .addText((c) => c.setValue(String(this.plugin.settings.maxTradesPerDay)).onChange(async (v) => {
        const k = Math.round(Number(v));
        this.plugin.settings.maxTradesPerDay = Number.isFinite(k) && k >= 0 ? k : 3;
        await this.plugin.saveData(this.plugin.settings);
        this.plugin.refreshViews();
      }));
    // ready-made tags for the review's tagging step: one per line
    const presets = (key, name, desc) => new Setting(containerEl).setName(name).setDesc(desc).addTextArea((c) => {
      c.inputEl.rows = 8;
      c.setValue(presetTags(this.plugin.settings, key).join('\n')).onChange(async (v) => {
        const s = this.plugin.settings;
        s.tagPresets = { setups: presetTags(s, 'setups'), mistakes: presetTags(s, 'mistakes'), [key]: uniqueTags(v.split('\n')) };
        await this.plugin.saveData(s);
      });
    });
    presets('setups', 'Ready-made setups', 'One per line. Every trade review offers them to tick, before the setups your trades already use.');
    presets('mistakes', 'Ready-made mistakes', 'One per line, offered the same way in the review.');
    new Setting(containerEl).addButton((b) => b.setButtonText('Reset to the built-in list').onClick(async () => {
      delete this.plugin.settings.tagPresets;
      await this.plugin.saveData(this.plugin.settings);
      this.display();
    }));
    new Setting(containerEl)
      .setName('Gym sessions per week')
      .setDesc('Weekly target used for the gym streak.')
      .addText((c) => c.setValue(String(this.plugin.settings.gymTarget)).onChange(async (v) => {
        this.plugin.settings.gymTarget = Math.max(1, Math.round(Number(v)) || 3);
        await this.plugin.saveData(this.plugin.settings);
        this.plugin.refreshViews();
      }));
    new Setting(containerEl)
      .setName('Journal days per week')
      .setDesc('Days with at least one trade logged that a week needs to count for the combo streak.')
      .addText((c) => c.setValue(String(this.plugin.settings.journalTarget)).onChange(async (v) => {
        this.plugin.settings.journalTarget = Math.max(1, Math.min(5, Math.round(Number(v)) || 3));
        await this.plugin.saveData(this.plugin.settings);
        this.plugin.refreshViews();
      }));
    new Setting(containerEl)
      .setName('Accounts')
      .setDesc('One account per line. Accounts used on a trade are listed automatically; removing a line here does not change any trade.')
      .addTextArea((c) => {
        c.inputEl.rows = 5;
        c.inputEl.cols = 40;
        c.setValue((this.plugin.settings.accounts || []).join('\n')).onChange(async (v) => {
          this.plugin.settings.accounts = [...new Set(v.split('\n').map((a) => a.trim()).filter(Boolean))];
          await this.plugin.saveData(this.plugin.settings);
          this.plugin.refreshViews();
        });
      });
    new Setting(containerEl)
      .setName('Account groups')
      .setDesc('One group per line, as "Group name: account one, account two". Groups show up in the dashboard and flex card.')
      .addTextArea((c) => {
        c.inputEl.rows = 5;
        c.inputEl.cols = 40;
        c.setPlaceholder('Combines: Combine 50K #1, Combine 50K #2').setValue(this.plugin.settings.groups).onChange(async (v) => {
          this.plugin.settings.groups = v;
          await this.plugin.saveData(this.plugin.settings);
        });
      });
    new Setting(containerEl).setName('Share day notes across accounts')
      .setDesc('Off: each account keeps its own day notes on the P&L calendar (prediction, charts and day review), and All accounts keeps its own. On: one note per day, the same on every account. Switching keeps every note: they come back when you switch again.')
      .addToggle((c) => c.setValue(!!this.plugin.settings.dayNotesShared).onChange(async (v) => {
        this.plugin.settings.dayNotesShared = v;
        await this.plugin.saveData(this.plugin.settings);
        this.plugin.refreshViews();
      }));
    new Setting(containerEl).setName('Customize lobby').setDesc('Put the lobby\'s sections in your own order, and hide the ones you don\'t need: the welcome message, the economic calendar, the music card and the rest.')
      .addButton((b) => b.setButtonText('Open').onClick(() => new LobbyLayoutModal(this.app, this.plugin).open()));
    new Setting(containerEl).setName('Resume music when the Music pane opens')
      .setDesc('Off: the song from last time waits on the player until you press Play. On: it starts playing as soon as the pane opens.')
      .addToggle((c) => c.setValue(!!this.plugin.settings.musicResume).onChange(async (v) => {
        this.plugin.settings.musicResume = v;
        await this.plugin.saveData(this.plugin.settings);
      }));
    new Setting(containerEl)
      .setName('yt-dlp path')
      .setDesc('Used by "Download video". The command name, or the full path to yt-dlp.exe. Videos are saved in <folder>/Videos. Desktop only.')
      .addText((c) => c.setValue(this.plugin.settings.ytdlp).onChange(async (v) => {
        this.plugin.settings.ytdlp = v.trim() || DEFAULT_SETTINGS.ytdlp;
        await this.plugin.saveData(this.plugin.settings);
      }));
    new Setting(containerEl)
      .setName('Video format')
      .setDesc('yt-dlp format selector. The default takes the sharpest picture and needs ffmpeg; without ffmpeg use "b".')
      .addText((c) => c.setValue(this.plugin.settings.videoFormat).onChange(async (v) => {
        this.plugin.settings.videoFormat = v.trim() || DEFAULT_SETTINGS.videoFormat;
        await this.plugin.saveData(this.plugin.settings);
      }));
    new Setting(containerEl)
      .setName('ffmpeg path')
      .setDesc('Used by "Save video" on a card over a video file: the card is rendered over the video at its full size (1080p, 4K) with its sound, instead of being recorded. The command name, or the full path to ffmpeg.exe. Desktop only.')
      .addText((c) => c.setValue(this.plugin.settings.ffmpeg).onChange(async (v) => {
        this.plugin.settings.ffmpeg = v.trim() || DEFAULT_SETTINGS.ffmpeg;
        await this.plugin.saveData(this.plugin.settings);
      }));
    localize(containerEl);
  }
}

