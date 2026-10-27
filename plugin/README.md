# TrueVision Journal — Obsidian plugin

A local-first trade journal inside your vault. Every trade is a Markdown note; the plugin reads the note
frontmatter to build the dashboard, so the data is always yours and readable without the plugin.

## Install

True Journal is installed by hand: it is not in Obsidian's community plugin browser. It runs on Windows and macOS
(Obsidian 1.4 or newer). Optional: the **Excalidraw** plugin, for chart drawings and the Lessons tab.

**First, in Obsidian (both systems):** Settings (the gear, bottom left) → **Community plugins**. If it shows
**Turn on community plugins**, click it. Then click the **folder icon** next to **Installed plugins** ("Open plugins
folder"): it opens your vault's plugins folder, `<your vault>/.obsidian/plugins/`, in Finder or File Explorer.

### macOS

1. Double-click `truevision-journal-obsidian-<version>.zip` in Downloads. Finder unzips it into a folder named
   `truevision-journal`.
2. Open the plugins folder with Obsidian's folder icon (above). You don't need to show hidden files, and it is
   better not to: if you pressed **Cmd + Shift + .** before, press it again so hidden files are hidden.
3. **First install:** drag the whole `truevision-journal` folder into the plugins folder.
   **Update:** open the `truevision-journal` folder that is already in the plugins folder and drag in only
   `main.js`, `manifest.json`, `styles.css`, `README.md` and the `art` folder, then click **Replace**. Don't replace
   the whole `truevision-journal` folder: Finder would delete `data.json`, your settings.
4. Back in Obsidian: Settings → Community plugins → click the **reload icon** next to Installed plugins, then switch
   on **True Journal**.

**"… can't be replaced because it's invisible"**: Finder never replaces hidden items, and stops the whole copy when
one is included. It happens when hidden files are showing and you select everything (that picks up Finder's hidden
`.DS_Store` file), or when you drag a `.obsidian` folder. Hide hidden files again (**Cmd + Shift + .**), then drag
only the files listed in step 3. Never drag a `.obsidian` folder into a vault.

No folder icon? Open your vault folder in Finder, press **Cmd + Shift + .** to see `.obsidian`, open
`.obsidian` → `plugins` (make `plugins` if it isn't there), then press **Cmd + Shift + .** again before copying.
A vault kept in iCloud is under iCloud Drive → Obsidian → your vault.

### Windows

1. Right-click `truevision-journal-obsidian-<version>.zip` → **Extract All…** → **Extract**. Extract it first:
   a zip opened with a double-click can't be installed from.
2. Windows puts the files in a folder named after the zip. Inside it is the **`truevision-journal`** folder (the
   one that holds `manifest.json`, `main.js` and `styles.css`): move or copy that folder into the plugins folder
   Obsidian opened. When updating, Windows asks about files with the same name: choose **Replace the files in the
   destination**. Windows merges the folders, so your `data.json` (settings) stays.
   - To find it by hand: File Explorer → your vault folder → `.obsidian` → `plugins` (make `plugins` if it isn't
     there). If you can't see `.obsidian`, turn on View → Show → **Hidden items**.
3. Back in Obsidian: Settings → Community plugins → click the **reload icon** next to Installed plugins, then switch
   on **True Journal**.

### If it doesn't show up

The files must sit directly in `<your vault>/.obsidian/plugins/truevision-journal/`: `manifest.json` inside that
folder, not in `truevision-journal/truevision-journal/`. Each vault has its own `.obsidian`, so put it in the vault
you use for trading. Restarting Obsidian also reloads the plugin list.

### Updating

Turn True Journal off (or close Obsidian), then copy the new **`main.js`, `styles.css`, `manifest.json`, `README.md`
and `art`** into your `truevision-journal` folder, replacing the old ones, and turn it back on. On a Mac, copy those
files, not the whole folder: the folder also holds **`data.json`, your settings** (accounts, rules, payouts, costs,
card designs), and Finder's Replace would delete it (Windows merges folders, so there it stays either way). Your trades and reviews are notes in the vault, so an update
never touches them.

## Use

**First run.** On a fresh install (no settings yet, no trades in the vault) a welcome guide opens: language, your
name, a first account and its prop firm challenge, getting trades in (import, one trade, or a day's P&L), and where
things are. Every step saves as you go and can be skipped; it opens by itself only once. The command "Show the
welcome guide" (or Settings → **Welcome guide**) brings it back.

**Process over money.** The Dashboard has a **Process** tile (the share of reviewed trades with no mistake
tagged) beside the win rate, and a **Cost of mistakes** card: what the trades tagged with each mistake made, worst
first, and the P&L of trades with no mistake against those with one. Saving a trade on an account with rules
warns you about what it brings close: little room left today before the daily loss limit (or past it), the max
loss less than a quarter away, a trade over the size limit, or a best day over the consistency limit near the
target.

**Prop firm extras.** A funded account's card shows its next payout as a plan: how many winning (or trading) days
are still needed, the earliest date for them, and anything else missing. The day review lists that day's news from
the economic calendar (this week's, with the lobby's filters).

Two buttons are added to the left ribbon — **Dashboard** (the TrueVision "TV" icon) and **Journal** (notebook-and-pen
icon) — and the same two, with text labels, to the status bar. Every screen has the same strip at the top to switch
between **Lobby · Dashboard · Journal · Gym · Logic tree**. All actions are also in the command palette.

- **Side panel** — True Journal's own panel in Obsidian's left sidebar, next to the file explorer (it is put there
  the first time; the command "Open the side panel" or the ribbon's panel icon brings it back after you close it).
  *Overview*: Lobby, Dashboard, Journal, Accounts and the Challenge tracker. *Reviews*: today's day review (on the account
  you traded today), trades waiting for review with their count, the review card (week or month), and the flex
  card. *Tools*: New trade, Import trades, Combine pyramid entries, pane layout, and Settings (theme and colours are in Settings, and the top strip's Style).
  *Tu*: Nhẫn and Mở hòm (see below). *More*: Lessons, Logic tree, Trophies, Gym and Music. The screen open in the main area is highlighted. The panel
  has no background of its own and uses Obsidian's colours, so it blends with the sidebar in any theme; turn on
  Obsidian's Settings → Appearance → **Translucent window** (macOS and Windows) for the see-through look. The search box
  on top finds trades by symbol, side, date, account, setup, mistake, tag or anything written in the note, and day
  notes by date, account or what you wrote; click a result to open it. Esc clears the search.
- **Lobby** — your trader profile, like a game's home screen: rank emblem and tier, level and XP, recent form
  (last 12 trades), current streak, badges, and a menu to New trade, Review, Dashboard and the **Profile card**
  (a shareable image of your rank, in average R or in $).
  - *Welcome*: the lobby opens with a greeting by the time of day ("Good evening, <your profile name>") and one line
    about your day: today's trades and P&L, and how many trades wait for a review; on a quiet day, that the markets
    are closed at the weekend, or a short line to trade by (a new one each day). It slides in when the lobby opens.
    Settings → **Welcome message in the lobby** turns it off or back on.
  - *Economic calendar*: under your profile, this week's news events from Forex Factory (its public weekly feed),
    by day from today on, in your computer's time: the impact (red high, orange medium, yellow low), the currency,
    the event, and the forecast and previous figures. Today's past events are dimmed. The High / Medium / Low
    buttons and the currency list (USD at first, or All) pick what shows. It is fetched once a day, the first time
    True Journal opens that day, and kept, so it still shows offline. Settings → **Economic calendar in the lobby**
    turns it off.
  - *Arrange lobby*: **Arrange** at the top of the lobby (or Settings → **Arrange lobby**) lists the lobby's
    sections: welcome, trader profile, economic calendar, music card, flex and gym cards, ranks, career stats,
    activity, streaks, and rank points and badges. ↑ / ↓ move a section, and its tick box shows or hides it; Reset
    puts the lobby back as it came.
  - *Career stats* is the stat sheet under the tier ladder: profit factor, win rate, average RR, balance, payouts,
    net P&L, expectancy, average win ÷ average loss, best and worst day, biggest win and loss, max drawdown.
    **Balances** sets a starting balance per account (balance = start + net P&L − payouts); **+ Payout** records
    a payout (date, account, amount). The Dashboard's Accounts tab shows payouts and balance per account and group.
  - *Rank points (0–1000)* come from your last 100 trades: Edge 260 (profit factor, average R; scaled down under
    50 trades), Consistency 160 (green days, win rate), Risk control 160 (trades with a stop, worst drawdown vs
    gross wins), Discipline 140 (trades reviewed, trades without a tagged mistake), Streaks 200, Volume 80 (trades
    logged). The lobby shows the points and the reason for each part; the Logic tree screen has the whole formula
    as a tree.
  - *Streaks* pay rank points while they are alive: Journal streak (weekdays in a row with a trade logged, 60 RP
    at 20 days), Review streak (newest trades in a row that are reviewed, 40 RP at 20 trades), Gym streak (weeks in
    a row on the gym target, 50 RP at 8 weeks), Combo streak (weeks in a row on both the gym target and the
    journal-days target, 50 RP at 4 weeks). Weekends never break the journal streak, and an unfinished day or week
    does not break a streak either. Green-day streak is shown but pays nothing.
  - *Dashboard charts*: under the tiles, the Overview shows the daily cumulative P&L, the net P&L of each day,
    how long trades were held, and the win rate for each holding time. Duration comes from the exit time: CSV
    imports read it from the exit column, and the trade form has an optional **Exit time**.
  - *Profile picture*: click the round picture next to your name in the lobby to upload one (PNG / JPG / WebP / GIF,
    up to 5 MB); it is kept at `TrueVision Journal/Profile/avatar.*`. × removes it.
  - *Card designs*: the flex card is drawn like a member card (chip, engraved border, your name and "member since")
    and comes in eight designs. Classic is always available; Bronze, Silver, Gold, Platinum, Emerald, Sapphire
    (Diamond) and Black (Master) open when your rank reaches that tier, and you pick among the ones you have.
    The lobby shows the card too ("Flex card"), with the same design picker next to it; a click opens the flex card.
  - *Trophies* (its own screen in the top switcher): a shelf with your rank emblem, a cup for every funded account
    still alive and for every payout, the badges, and a **Certificates** wall. "Add certificate" (or dropping
    pictures on the wall) copies PNG / JPG / WebP / GIF pictures or PDFs into `TrueVision Journal/Certificates/`; the
    file name is the caption (✎ renames it), a click opens it, × sends it to the trash. A PDF shows its first page.
  - *Certificates in the lobby*: under the flex and gym cards, the certificates you choose. **Choose…** (or "Show your
    certificates" while none are picked) opens a window with all of them: tick the ones to show, in the order you want
    them (numbered), and **Add certificates** adds new ones and shows them straight away. A click opens one large.
  - *Payout certificates*: every payout gets a certificate of its own, drawn with your name, the amount, the account
    and the date. It opens when you record the payout, and again from its cup in the Trophy room (**View
    certificate**). **Copy image** puts it on the clipboard; **Save to certificates** saves it as a PNG in
    `TrueVision Journal/Certificates/`, where the wall shows it. It comes in skins, like the flex card: True Vision is
    always open, three more open with each rank tier (Iron to Challenger), each with its own picture, motto and rarity;
    a few are in Japanese, Vietnamese or Spanish. "Your Picture" uses a picture you upload (kept at
    `TrueVision Journal/Profile/cert-picture.*`), and "Overall Payouts" draws one without a picture. The Trophy room
    also counts the total of every payout received, with a certificate for the total and one for each milestone it
    has passed ($1K, $2.5K, $5K, $10K … $1M).
  - *Accounts*: the **Accounts** button on the career stats lists every account with its starting balance, an
    optional max loss, its type (Eval or Funded), a Blown switch and Delete. An account is blown when you switch it
    on, or by itself once its trades take it that far below the starting balance (measured from the start; it does
    not trail). A blown account keeps its trades in every statistic, but its balance stops counting, it is tagged
    in the Accounts tab and the account picker, and it is no longer offered for new trades. Delete removes the
    account from the list, its groups, balance, status and payouts; you choose whether its trades go to the trash
    or stay as trades without an account.
  - *Penalties* come off the rank points (up to −240): overtrading −5 per day with more trades than the daily limit
    (Settings → Max trades per day, default 3, 0 = off; up to −40), risk rule −4 per trade that lost 1.5R or more
    (up to −40), a blown funded account −80 and a blown eval account −30, each for 90 days (up to −160).
  - *Activity* is a year-long heatmap above the streaks, like a contribution graph: one square per day, one column
    per week, darker the more was logged that day (trades journaled plus gym sessions). Hover a square for the day's
    counts; the header shows active days in the last year and the current and best run of active weekdays.
  - *Tiers* follow the League of Legends ladder: Iron 0, Bronze 150, Silver 280, Gold 400, Platinum 510,
    Emerald 610, Diamond 700 (each with three divisions, III → I), then Master 800, Grandmaster 870, Challenger 940. Fewer than 10 trades
    = Unranked (placement).
    Each tier has its own badge (original artwork drawn by the plugin): a distinct frame shape in the tier's
    colour, flat two-tone facets with no gradients or gloss, and the division shown inside as stacked chevrons
    (1 = III … 3 = I). The three apex tiers carry a cut gem instead, and Challenger adds a ring of rays.
    The Ranks card under the banner is a grid of every tier and division, with your current one highlighted.
    To use your own picture for a tier, put it in `TrueVision Journal/Ranks/` named after the tier — `iron`,
    `bronze`, `silver`, `gold`, `platinum`, `emerald`, `diamond`, `master`, `grandmaster`, `challenger`,
    `unranked` — as .png, .webp, .jpg or .svg. It replaces the drawn crest on the lobby, the ladder and the
    profile card. The plugin ships no rank pictures; only use artwork you have the right to use.
  - *Level* is activity, not results: 10 XP per trade logged, 15 per review, 20 per gym session, 5 per green day.
- **Dashboard** — pick "All accounts (total)", a group or one account, and a period: all time, today, this or last
  week, this or last month, this year, the last session, or **Custom dates…** for any from–to days (the Journal and
  the Flex card have the same choice). Four tabs:
  - *Overview*: net P&L with the equity curve, win rate, profit factor, average R, max drawdown, pending reviews,
    results by setup and by weekday, recent trades.
  - *Calendar*: P&L calendar, one month at a time, with daily and weekly totals.
  - *Accounts*: results per account (with a total row) and per account group; click a row to focus on it.
  - *Simulation*: 1,000 Monte Carlo runs that resample your past trade results to show the likely range after
    100–1,000 more trades, the typical drawdown, and the chance of hitting a drawdown limit you set.
  New trade, Review and Flex card are buttons at the top. **+ Account** adds an account (optionally into a group).
- **Day review** — click a day on the Dashboard's P&L calendar. *Prediction* (before the session): a Bullish and a
  Bearish scenario with a chart per timeframe (Daily, H4, H1 and M15 to start; "+ Timeframe" adds any other, and the × beside a
  timeframe removes it; the list is the same for every day) — paste a screenshot (⌘V) into a slot, drop a file,
  choose one, or paste a TradingView snapshot link — then *Anticipation* (your notes) and your bias. *What actually
  happened* (after it): bullish, bearish or range day, the same four charts and what you saw; when bias and outcome are
  both set it says whether the forecast played out. The charts are saved next to the day note, in a `<date>/` folder, and
  shown as tables in it. Below that, that day's numbers and trades, your thesis and notes on
  each trade (Notes), its trade reviews, and the day's own review — what you did well, what you could improve, and
  your focus for the next session — all saved as you type (a ✎ marks those days on the calendar). **Each account keeps its
  own day notes**: a note written on one account doesn't show on the others. They live in
  `TrueVision Journal/Days/Accounts/<account>/<date>.md`, a group's in `Days/Groups/<group>/`, and All accounts keeps
  its own in `Days/<date>.md`. All accounts still marks the days written on an account, and the day's window links to
  them ("Day notes on …"). Renaming an account takes its day notes along. Prefer one note per day for every account?
  Turn on Settings → **Share day notes across accounts** (switching never deletes a note; they come back when you
  switch again). **Share** turns it into the review card for that day, which now also prints the
  day review (tick "Day review" under Review).
- **Journal** — every trade as a row, newest first; click a row to open the note. **Filters** (beside the account
  and period) narrows the list by any column: symbol, side, result (wins, losses, breakeven), setup, mistake (any
  mistake, no mistake, or one such as FOMO) and review status, and a from–to range for net P&L, R, quantity, entry and exit; the count and P&L beside it follow the
  filters. With one account picked, **Rename** renames it everywhere: its trade notes, its rules and status, the
  challenge steps linked to it, groups and payouts (the Dashboard has the same button). Each row has **Draw / Open** for
  an Excalidraw chart of that trade (needs the Excalidraw plugin): the drawing is created in
  `TrueVision Journal/Charts/`, opened beside the note and embedded under `## Chart`.
  The ✎ button on a row opens the same form to **edit** the trade's numbers (or delete it — the note goes to the
  trash); **Import trades** (at the top of the **New trade** form — the button on the Dashboard, Journal and Accounts
  screens — or the command "Import trades") brings in an export from your platform — TopstepX, Tradovate, cTrader, MetaTrader 4 / 5,
  Interactive Brokers, ATAS, Hyperliquid, Rithmic, TradingView Paper Trading, Blofin, Bybit, Sierra Chart,
  TradeZero, Trading Technologies, NinjaTrader, or your own spreadsheet — as CSV, tab-separated, HTML or Excel
  (.xlsx). Pick the platform (or Auto-detect) to see how to export from it. The window then lists every trade in the
  file with a tick box: new ones start ticked, ones already in the journal are greyed out, and **Select all / Select
  none** help — import one trade or all of them. MetaTrader 5's report works as Open XML
  (an .xlsx file) or HTML, from a terminal in any language. **Tradovate's exports carry no fees or
  commissions**, so those trades come in at their P&L before fees (fees differ from one prop firm to the next): add
  them on the trade under Fees if you want them counted. Exports with their own fees (TopstepX) keep theirs. Files with one row per order or fill
  are paired into trades first in, first out. Files with one row per trade can list each add to a position as its own
  trade; trades on the same account and symbol that close at the same second are combined into one trade with
  **pyramid entries** (the entry is the size-weighted average, the size the total, each add is kept under `entries`, and
  the P&L is the sum). Turn "Combine adds into one trade" off to keep them apart. For trades already in the journal,
  the Journal shows how many groups closed together and **Combine…** (or the command "Combine pyramid entries")
  lets you tick the ones to combine. Import into one of your accounts, a new account, or the account names
  in the file. It previews new, duplicate and unreadable rows before anything is written, and importing the same
  file twice adds nothing.
- **New trade** — a form (with **Import trades** at the top) that creates `TrueVision Journal/Trades/<date> <time> <symbol> <direction>.md`.
  For a trade held overnight (or over a weekend), set the **Exit date** as well as the exit time; the trade stays on
  the day it was opened, and the time held counts every day in between.
  Prices get their thousands commas as you type (`29,815.50`), and when something can't be saved the form names the
  field (date, symbol, entry or exit price, stop, size, value of a 1.0 move, fees, net P&L) and outlines it.
  **Enter the P&L directly instead of prices** (a switch under Direction) is for a quick entry: what a trade made,
  or your whole day, without entering the trades one by one. The prices, size and exit time go away and you type
  the P&L before fees; the Fees field is still taken off, and the form shows the result after fees. It is saved as
  one trade (`pnlOnly: true` in the note, entry and exit written as 0), so it counts as one trade in your stats; the
  Journal, the trade card and reports show a dash where its prices would be.
- **Review** — opens with a summary of the trade (P&L, R, size, entry → exit, time held), then asks branching
  questions one at a time (different for wins and losses), with a progress bar. Pick an answer with a click or keys
  1–9, write with ⌘/Ctrl+Enter to continue, and go back to change an answer. An optional last step tags the setups
  and mistakes — tick as many as fit, or type a new one into "+ New". A ready-made list is always offered (setups such
  as Continuation, Reversal Pattern, 2022 Model, Liquidity Sweep, Turtle Soup, FVG, Order Block, Silver Bullet, SMT;
  mistakes such as Early Entry, FOMO, Revenge Trade, Overtrade, Poor Position Sizing, Moved Stop, Against Bias); edit
  it under Settings → Ready-made setups / mistakes, or reset it to the built-in list. Answers are written to the note under `## Review`, the note is marked `reviewed: true`, and you
  can go straight on to the next trade waiting for a review.
- **Flex card** — a shareable result image for the chosen account/group and period, in $ or in R only. Copy it to
  the clipboard or save it to `TrueVision Journal/Flex/`.
- **Gym** — log a session (date, type, minutes, exercises as `Bench press 4x8 60`, one per line). Shows sessions
  this week against your weekly target, the streak of weeks on target, a month calendar of training days, your
  best lift per exercise and recent sessions. Sessions are notes in `TrueVision Journal/Gym/`.
- **Logic tree** — a sketch board for decision logic. A tree is a nested bullet list in a note under
  `TrueVision Journal/Logic/`, drawn left to right; hover a box to add a branch, rename or delete it, or edit the
  note directly. Three read-only trees show the review questions asked after a loss and after a win, and how rank points are calculated.

**Accounts and prop firm challenges.** The **Accounts** screen (or the command "Open accounts") shows a card per
account: its challenge's steps (for example Trading Combine → Express Funded, or FTMO Challenge → Verification →
FTMO Account) with the current one highlighted, then balance, profit target, room left before the max loss, today
against the daily loss limit, trading days, profitable days, consistency and position size, with a status —
Active, Ready to advance, Passed or Breached.

- *Challenge*: pick the firm, the challenge and the current step from the list built into the plugin —
  MyFundedFutures, Lucid Trading, Tradeify, Take Profit Trader, FundedNext Futures, Apex Trader Funding, Topstep,
  FTMO, FTMO Futures, Legends Trading, The Trading Pit, FFN and The5ers — or Custom, then adjust any number. Each step has its own rules: profit target; max loss fixed,
  trailing at end of day or trailing intraday (on closed trades), with the balance where it stops trailing; a daily
  loss limit that ends the day or fails the account (it can change with profit); minimum trading and profitable
  days; consistency; and position size, fixed or scaling with profit (micros count as a tenth). The account keeps
  a copy of its step's rules, so a newer list does not change it. Rules change — check them against
  your firm's dashboard.
- *Consistency calculator*: hover over (or tap) the **Consistency** line on an account's card or in its overview —
  the one with the calculator mark. It shows your best day, the profit so far and the limit, then what it takes:
  how much more to make (and the total), with no day above your best day; the range one day can make to meet it
  (from the least that is enough to the most that keeps it met), or else how many days it takes at the least; and,
  with a profit target, what passing takes when the target asks for more. Once it is met, it says how much your
  next day can make and how big a loss would break it again. What you need is rounded up and what you may make
  rounded down, so following it is never a dollar short. The payout's consistency check (funded accounts) has the
  same calculator for the current payout cycle.
- *Adding an account*: **+ Account** asks for the name, then the prop firm, the challenge and the step it is on;
  the rules (target, max loss, daily loss, consistency, size) and the starting balance fill in from the list, and
  "Another firm" opens the rules window to type them in. None is a personal account with no rules. The card has no
  Overview or Rules button: a click on the card opens the overview, where **Rules** adjusts them.
- *Practical rules*: an account's Rules also hold how its firm treats high-impact news (allowed, no new trades in a
  window, profit in the window taken off, or not allowed) with the minutes either side, and how many days it can go
  without a trade before the firm may close it. Firms checked on their own help pages fill these in (Topstep: no
  new trades ±5 minutes around Tier 1 news; funded accounts closed after 30 days without a trade); the rest are
  empty until you set them. Saving a trade warns you when a high-impact USD release from the calendar fell inside
  the window, and the account card shows **Inactivity** once the account is 5 days from the limit. Hover any rule
  line for one sentence on what it means. In + Account, under the rules, the date they were checked turns orange
  after a month; the account's overview shows, during an evaluation, what the next step asks ("Once Express
  Funded: …").
- *Overview*: click an account's card for its overview — balance, net P&L, payouts, room to the max loss, its balance
  over time with the max-loss line and the target, the rules, recent trades and the payouts taken.
- *Payouts* (funded accounts): every funded step in the list has its firm's payout rules — the days needed per payout
  (winning days above an amount, trading days or calendar days), consistency (the best day's share of the cycle's
  profit), how much can be taken (all or part of the profit, or the profit above a balance floor), the minimum and
  maximum request, the profit split, and what happens after a payout (the max loss can lock, the cycle starts again,
  some accounts close or go live after a number of payouts). The overview checks each rule, and **Request payout**
  opens when they are all met: the amount comes off the account's balance and your share (after the split) is added
  to your payouts on the dashboard and in the lobby. A payout the firm already paid can be recorded anyway. Accounts
  set up before the list had payout rules use the rules of their step in the list.
- *Rename*: the pencil after an account's name (on its card and in its overview) renames it everywhere — its trade
  notes, rules and status, linked steps, groups, payouts and costs.
- *Challenge tracker* (the second tab of the Accounts screen): what the challenges cost against what the payouts
  brought back. **+ Cost** records a cost — an evaluation, an activation fee, a reset or another fee — with its date,
  account (one of yours, or any name for an account no longer in the journal), firm (empty = the firm of the account's
  challenge) and a note; click a cost to edit or delete it. Each account card also has the cost right on it: **Spent**,
  its costs as chips (click to edit, × to remove) and a type + amount + **Add cost** row (dated today). **+ Account** takes the evaluation price and **Advance**
  the activation fee of the next step. The tracker shows money spent on evaluations, extra costs, payouts received
  (after the split), the net and the ROI = (payouts − spent) ÷ spent, then the same per firm, then every cost and
  payout, newest first, for the chosen dates. The account overview shows what that account cost. Costs are kept in
  the plugin settings (`costs`) and never change a balance; deleting an account keeps its costs.
- *Mark breached* closes an account; an account whose trades break its rules is marked breached by itself.
- *Advance to next stage* (evaluations only — a funded account has no Advance) marks the account passed and starts
  the challenge's next step as a new, linked account.
  A passed step keeps its trades but no longer counts in your balance.

**Sharing for review.** The **Share** button on the Journal screen (or the command "Share for review") does two
things:

- *Export a package*: one .zip with the trade notes of a period (last 30 days, last 3 months, this month or
  everything) for all accounts, a group or one account, plus each trade's Excalidraw drawing and every image
  embedded in the notes and drawings. The size is shown before you export; a text-only package (toggle off
  drawings and screenshots) is a few KB per trade, and with media the size is essentially the size of your
  screenshots. The file is written to `TrueVision Journal/Exports/`.
- *Import a package*: unpacked into `TrueVision Journal/Reviews/<name>/` and kept apart from your own journal —
  it never counts in your stats. A switcher appears at the top of every screen ("My journal" / "Reviewing · …")
  so a mentor can open a student's Dashboard, Journal, Lobby, trade notes and drawings. Imported packages can be
  deleted from the same dialog.

**Working in panes.** Every screen adapts to the width of its pane (tighter spacing, smaller numbers, fewer table
columns), so it stays readable as a third of the window or in a sidebar. The **Layout** button at the end of the top strip
(or the command "Choose a pane layout") offers five arrangements — Dashboard · Journal · Note, Lobby · Journal · Note,
Journal · Note, Dashboard · Journal, Lobby only — and a button to close the plugin's panes. Only the plugin's own panes
are rearranged; the note pane starts on your most recent trade. Trade notes and chart drawings
opened from the plugin always go to that one side pane, so tabs do not pile up.

**Style.** The **Style** button at the end of the top strip (or the command "Style: theme and colours") sets the
look of the plugin's screens and dialogs only — the rest of Obsidian is untouched:

- *Theme*: Auto (follow the Obsidian theme), Dark, Midnight, Terminal, Amber, Mono, Light, Lavender, Breeze, Rose.
- *Monkeytype themes*: 187 more, the colour themes of [Monkeytype](https://monkeytype.com) (open source, GPL-3.0;
  only the colours are used), many of them GMK keycap colourways (olivia, botanical, laser, dots, 8008, carbon …).
  Each tile is drawn in its own colours; type in the search box to find one. A theme's background, second background
  (cards), text, main colour (accent) and "sub" colour (muted text, lightened where it would be too faint to read)
  are used as Monkeytype defines them.
- *Win / loss colours*: Auto, **From theme** (with a Monkeytype theme: its main colour for wins, its error colour for
  losses) or one of nine pairs (green/red, cyan/red, teal/rose, indigo/amber, mint/pink,
  lavender/orange, sky/magenta, lime/rose, white/grey). They colour P&L numbers, bars, the equity curve, the
  calendar and the form strip.
- *Accent*: from the theme, or one of eight colours, for the main button, meters and highlights.
- *Background picture or video (every screen)*: a PNG, JPG or WebP picture, or an MP4, WebM or MOV video (up to
  80 MB), or **Use a YouTube or TikTok video** (on a computer with yt-dlp the video is downloaded into the vault;
  without it, its cover becomes a still background). A video plays silently on a loop behind every screen of the
  plugin under the same wash as a picture (Background: bright, balanced, dim or faint). **Fill the screen** covers
  each screen (cropped at the edges); **Show all of it** shows the whole picture or video, scaled down to fit. Screens in a background tab
  pause it, and it holds still with the system's Reduce motion on. It is kept as `<journal folder>/Profile/wallpaper.<ext>`.

Flex and profile card images keep their own fixed dark design.

**Language.** English or Vietnamese, in the Style panel or the plugin settings. "Auto" follows the language
Obsidian is set to. It covers the plugin's screens, dialogs, notices and the text on the card images; trading
terms traders use in English (Net P&L, profit factor, drawdown, payout, review, setup) and tier names are kept.
Command and ribbon names switch after reloading Obsidian. Your own text — account, setup and tree names — is
never translated.

Settings: journal folder, profile name and tagline, gym sessions per week, journal days per week, accounts, and account groups (one per line:
`Combines: Combine 50K #1, Combine 50K #2`).

## Coming from the TrueVision web journal

On the web journal, open **Dữ liệu → Xuất Markdown (.zip)** and unpack the zip into the vault root. The notes use
the same format, so they show up on the dashboard immediately.

## Trade note format

```yaml
---
type: tv-trade
date: 2026-10-02
time: "09:47"
symbol: "NQ"
direction: long
entry: 30955
exit: 31040
stop: 30928
qty: 1
pointValue: 20
fees: 4.5
setups: ["ORB 15 phút"]
reviewed: false
---
```

P&L and R are always recomputed from entry, exit, stop, quantity, point value and fees; the `pnl` and `r` fields
written to the note are there for Dataview queries and other tools.

## Pictures

The card emblems, rank pictures and certificate skin pictures are in `art/`; the sounds of Nhẫn and Mở hòm are in `sounds/`. The rank pictures (`art/rank/`) are League of Legends ranked
emblems: this plugin was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games.
Riot Games does not endorse or sponsor this project. Delete `art/rank/` to use the drawn emblems instead.

## Moving flex cards and the verified tick (0.32.1)

- **Video background.** In the Flex card dialog, "Upload a picture or video" also takes an MP4, WebM or MOV file
  (up to 80 MB). The card then plays in the dialog, and **Save video** records one loop of it (at most 15 seconds)
  into `<journal folder>/Flex/` as .mp4 (or .webm where the device cannot write MP4). Copy image and Save to vault
  still give a still picture of the frame on screen.
- **YouTube video.** "Use a YouTube video" takes a video's link. In the Flex card dialog the video plays (muted,
  looping) behind the card. YouTube's player cannot be recorded, so pictures you copy or save use the video's
  cover instead, and there is no Save video for it — upload a video file for a moving card you can save.
- **Verified tick.** Settings → "Verified tick" shows a blue tick after your name on the profile card.

**Sound and stills.** A background video starts silent; **Sound on** turns its sound on (and, for an uploaded
video, puts the sound into the video you save). **Copy image** and **Save to vault** take the card as it looks at
that moment of the video — also over a YouTube video on desktop, where the app window is captured.

**Profile card over YouTube.** The profile card's "Use a YouTube video" does what the flex card's does: the
video plays behind the card in its dialog, with Sound on / off, and Copy image / Save to vault take the card as it
looks at that moment.

**Every card.** The trade P&L card shares the flex card's background, so it plays the same video (file or YouTube)
with the same Sound, Save video and still-at-that-moment buttons. The profile card and the gym cards (the overall
one and the one per session) take a video file as their own background too ("Upload background"), with Sound and
Save video. The review card stays a picture: it is a tall report, not a card.

## Music pane (0.32.1)

The **Music** screen (navigation bar, or the command "Open the Music pane") plays music while you journal. It has
these tabs:

- **Paste link** — on a computer with yt-dlp (see Video tools), paste a song or a playlist from YouTube, SoundCloud
  or most other music and video sites. The plugin plays its sound itself: no web page, so no advertisements and no
  sign-in. **+ Queue** (or Shift+Enter) adds it to the queue; a playlist link opens into its songs. Songs you have
  heard are kept in a cache in your computer's temporary folder (the newest 600 MB, never in the vault), so they
  start at once next time. Your keyboard's media keys and the system's now-playing panel control it.
- **YouTube** — paste a video or playlist link, or type words to search. It is shown the way a music app would
  show it: the cover, the title and channel, a time line you can click to seek, and Previous / Play / Next.
  **+ Queue** (or Shift+Enter) adds a video to the queue; the queue keeps its place between restarts and plays on by
  itself when a video ends. Search opens YouTube's own search in the player's page and lists the results, each
  with a play and an add-to-queue button (searching stops the song that is playing). The YouTube page itself
  plays out of view, like a tab in the background; "Show video" brings it into view. Nothing is downloaded, and
  what plays — advertisements included — is YouTube's own. No sign-in is needed.
- **SoundCloud** — paste a track, playlist or profile link: SoundCloud's own player plays it without signing in
  (Go+ tracks play a 30-second preview). The plugin only follows and steers that player through messages; it never
  loads SoundCloud's code into Obsidian itself.
  **Signing in (Premium).** Google does not sign anyone in inside an app's built-in browser, Obsidian included.
  "Sign in with Chrome (Premium)" switches the player to a real Chrome window that the plugin starts with a
  profile of its own (kept outside the vault) and controls through a private pipe — no port is opened. "Sign in to
  Google" opens that profile as a plain Chrome for you to sign in; press "I have signed in" and the player takes
  it up again, signed in. While it plays that browser has no window at all; the only window you ever see is the sign-in one. Needs Chrome, Brave, Edge
  or Chromium on the computer; when more than one is installed, a menu picks which one plays (each keeps its own
  profile). The plugin never sees your password.
- **Radio** — internet radio by style (lofi, chillout, ambient, jazz, classical, piano, instrumental, electronic).
  The station list comes from Radio Browser (radio-browser.info), an open directory; each station plays its own
  stream. ☆ keeps a station under "Your stations".
- **My music** — your own audio files (MP3, M4A, WAV, OGG, FLAC, Opus; up to 60 MB each), kept in
  `<journal folder>/Music/` and played as a playlist in name order.

**Playlists** (the button after the tabs): Favorites and playlists of your own, of YouTube and SoundCloud links;
an item can be a whole playlist. The heart keeps what is playing in Favorites, and **+** adds it to one of your
playlists; both are also on the lobby's music card.

**Lyrics.** While a song plays, its synced lyrics show under the player and on the lobby's music card: the line
being sung and the next one. They come from LRCLIB (lrclib.net), an open lyrics library; only the song's title and
artist are sent. If they run early or late, **−1s / +1s** or **Lyrics start now** (press it as the singing starts)
moves them for that song, and **Reset** goes back.

Radio and your own files go on playing whichever tab is shown. A link from the other service switches to its tab. The last twelve links per tab are kept. On mobile each tab
shows the service's small player instead. Layout → "Journal · Note · Music" and "Dashboard · Journal · Music" open
the pane beside the journal.

**The music card in the lobby.** Between the trader profile and the flex card sits a music card: a record that
shows the cover of what the Music pane is playing and turns while it plays, and beside it the title, a time line
you can click to seek, and Previous / Play–Pause / Next. With nothing playing, the record opens the Music pane.
Don't want it there? The × in its top-right corner (on hover) hides it, and Settings → **Music card in the lobby**
turns it off or back on. The Music pane itself keeps working either way.

**Opening the pane doesn't start the music.** The song from last time waits on the player (cover, title, artist) until you
press **Play**. To have it play as soon as the pane opens, turn on Settings → **Resume music when the Music pane opens**.
Music that is already playing keeps playing when you come back to the pane.

## Tu: Nhẫn and Mở hòm (0.33.0)

**Tu** in the top strip (and in the side panel) holds two practice screens.

- **Nhẫn** (command "Nhẫn: practise patience") — a small game of patience. Tap the seal (or press Space) to count one
  "nhẫn", with the knock of a wooden fish; or switch to Hold, and let go only once the ring is full. Your total
  climbs through levels (Tập sự, Biết chờ, Bình tĩnh … Thiền sư), with a streak of days and a line to remember while
  you wait for the trade.
- **Mở hòm** (command "Open a study case") — pick what to study or backtest (Backtest NQ, ES or GC, ICT 2022,
  Orderflow, OptionFlow) and the time you have (15, 30, 60 or 120 minutes), then open the case: the reel stops on
  a task, common, rare, epic or legendary. Do it with the timer, then **Done** or **Skip**. A finished task gives
  EXP (minutes × its rarity) towards your study level, and is added to `TrueVision Journal/Study/<date>.md`.
  Your own sounds replace the built-in ones: put `case-tick`, `case-open`, `case-reveal` or `case-reveal-<rarity>`
  (MP3, WAV, OGG or M4A) in `TrueVision Journal/Sounds/`.

## Video tools (this build)

This build adds video downloading. It needs two free command-line tools on a computer (not on a phone):

- **yt-dlp** downloads the video behind a YouTube or TikTok link, and plays the sound of a link in the Music pane.
- **ffmpeg** renders a card over a video file, and turns H.265 video into H.264 so Obsidian can show it.

Install them, then quit and reopen Obsidian:

- Windows: `winget install yt-dlp.yt-dlp` (brings ffmpeg with it)
- macOS: `brew install yt-dlp ffmpeg`

What they are used for:

- **Use a YouTube or TikTok video** (flex card, profile card): the video is downloaded and becomes the card's
  video file, so it plays with its sound.
- **Save video** on a card over a video file: the card is rendered over the video itself, at the video's own
  size and length, with its sound. Without ffmpeg the card is recorded, as before.
- **Download video (TikTok / YouTube)** in the command palette saves a video into `<journal folder>/Videos`
  and embeds it in the open note.

If a tool is not found, put its full path in Settings (**yt-dlp path**, **ffmpeg path**).
