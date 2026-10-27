/** Vietnamese for one piece of text, or the text unchanged when nothing matches. */
function viText(text) {
  const raw = String(text);
  const core = raw.trim();
  if (!core) return raw;
  let out = Object.prototype.hasOwnProperty.call(VI, core) ? VI[core] : null;
  if (out === null) {
    for (const [pattern, to] of VI_PATTERNS) {
      const m = core.match(pattern);
      if (!m) continue;
      out = typeof to === 'function' ? to(m) : core.replace(pattern, to);
      if (out !== null) break;
    }
  }
  return out === null ? raw : raw.replace(core, () => out);
}

/** Text in the current language. */
const tx = (text) => (LANG === 'vi' ? viText(text) : text);

/** Words whose Vietnamese depends on where they stand: { place: { English: Vietnamese } }. tx() gives the meaning
 *  most screens need (Balance = Số dư, More = Thêm, Volume = Số lệnh đã ghi); txIn(place, text) the one for that
 *  place. What it returns is not an English key, so the page translator leaves it as it is. */
const VI_IN = {
  gym: { Balance: 'Cân bằng' }, // the gym card design
  activity: { More: 'Nhiều' }, // the activity map's "Less … More"
  music: { Volume: 'Âm lượng' }, // the music card's loudness
};
const txIn = (place, text) => (LANG === 'vi' && VI_IN[place] && Object.prototype.hasOwnProperty.call(VI_IN[place], text) ? VI_IN[place][text] : tx(text));

const LABEL_ATTRS = ['aria-label', 'placeholder', 'title'];
const LABELLED = '[aria-label], [placeholder], [title]';

/** Translates what is already on screen under `root` (text, aria-label, placeholder, title). */
function localize(root) {
  if (LANG !== 'vi' || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const next = viText(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }
  const marked = root.querySelectorAll ? [...(root.matches && root.matches(LABELLED) ? [root] : []), ...root.querySelectorAll(LABELLED)] : [];
  for (const el of marked) {
    for (const attr of LABEL_ATTRS) {
      const value = el.getAttribute(attr);
      if (value && viText(value) !== value) el.setAttribute(attr, viText(value));
    }
  }
}

/** Keeps `el` translated while it changes (screens re-render themselves often). Returns a stop function. */
function keepLocalized(el) {
  localize(el);
  const observer = new MutationObserver((changes) => {
    if (LANG !== 'vi') return;
    for (const change of changes) {
      if (change.type === 'characterData') {
        const next = viText(change.target.nodeValue);
        if (next !== change.target.nodeValue) change.target.nodeValue = next;
      } else if (change.type === 'attributes') {
        // a label set after the element was added (a button whose aria-label follows its state)
        const value = change.target.getAttribute(change.attributeName);
        if (value && viText(value) !== value) change.target.setAttribute(change.attributeName, viText(value));
      } else for (const node of change.addedNodes) localize(node.nodeType === 1 ? node : node.parentNode);
    }
  });
  observer.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: LABEL_ATTRS });
  return () => observer.disconnect();
}

const notify = (message) => new Notice(tx(message));
const ask = (message) => window.confirm(tx(message));

/** A title whose last word is set in the italic accent face, the way a magazine leans on one word: "Add account" ->
 *  Add <em>account</em>. One-word titles stay plain. The text is translated first, since the page translator only
 *  matches whole texts. */
function accentTitle(parent, tag, text, cls) {
  const t = tx(String(text));
  const el = parent.createEl(tag, cls ? { cls } : {});
  const i = t.trimEnd().lastIndexOf(' ');
  if (i < 0) { el.setText(t); return el; }
  el.appendText(t.slice(0, i + 1));
  el.createEl('em', { cls: 'tvj-accent-word', text: t.slice(i + 1) });
  return el;
}
