// ---------- career stats: balance, payouts and the profile stat sheet ----------

/** Accounts a scope covers: every known account (but Demo ones), one account, or a group's accounts. */
function scopeAccounts(scope, allAccounts, groups) {
  if (scope.startsWith('account:')) return [scope.slice(8)];
  if (scope.startsWith('group:')) {
    const g = groups.find((x) => x.name === scope.slice(6));
    return g ? g.accounts : [];
  }
  const demo = demoAccountsNow();
  return allAccounts.filter((a) => !demo.has(a));
}

/** Balance = starting balance + net P&L of the account's trades - payouts taken out. Null when no start is set. */
function accountBalance(name, trades, accountInfo, payouts) {
  const start = accountInfo && accountInfo[name] ? Number(accountInfo[name].start) : NaN;
  if (!Number.isFinite(start)) return null;
  const net = sum(trades.filter((t) => accountName(t) === name).map(netPnl));
  const paid = sum((payouts || []).filter((p) => p.account === name).map((p) => p.amount));
  return { start, net, paid, balance: start + net - paid };
}

/** The numbers on the lobby's stat sheet, for the accounts in scope. `trades` are already filtered to the scope. */
/** 'funded' or 'eval' (an evaluation / combine). Set per account; until then a name containing "fund" counts as funded. */
function accountKind(name, accountInfo) {
  const kind = accountInfo && accountInfo[name] && accountInfo[name].kind;
  return kind === 'funded' || kind === 'eval' || kind === 'demo' ? kind : /fund/i.test(name) ? 'funded' : 'eval';
}

/** Is the account still alive? An account is blown when you marked it so (accountInfo[name].blown = the date), or
 *  when it has a max loss set and its trades, in order, took it that far below the starting balance at any point.
 *  `room` is what is left before the max loss (null when no max loss is set). The max loss is measured from the
 *  starting balance; it does not trail the way some prop firms' drawdown does. */
function accountStatus(name, trades, accountInfo) {
  const info = (accountInfo && accountInfo[name]) || {};
  const maxLoss = Number(info.maxLoss);
  const hasLimit = Number.isFinite(maxLoss) && maxLoss > 0;
  let net = 0, breachedOn = '';
  for (const t of trades.filter((x) => accountName(x) === name).sort(byTime)) {
    net += netPnl(t);
    if (hasLimit && !breachedOn && net <= -maxLoss) breachedOn = t.date;
  }
  // an account with challenge rules is also breached by them (trailing max loss, a daily limit that fails it)
  const challenge = info.rules ? challengeStatus(name, trades, accountInfo) : null;
  if (challenge && challenge.breachedOn && (!breachedOn || challenge.breachedOn < breachedOn)) breachedOn = challenge.breachedOn;
  const manual = typeof info.blown === 'string' && info.blown ? info.blown : '';
  return {
    blown: !!(manual || breachedOn),
    blownOn: manual || breachedOn,
    auto: !manual && !!breachedOn,
    maxLoss: challenge && challenge.maxLoss ? challenge.maxLoss : hasLimit ? maxLoss : null,
    room: challenge && challenge.maxLoss ? Math.max(0, challenge.room) : hasLimit ? Math.max(0, maxLoss + net) : null,
    passed: typeof info.passed === 'string' && info.passed ? info.passed : '',
  };
}

