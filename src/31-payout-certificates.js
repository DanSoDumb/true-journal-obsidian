// ---------- payout certificates: one picture per payout, in skins your rank opens (three with each tier) ----------

const CERT_W = 1500;
const CERT_H = 1075;
const RARITIES = {
  common: { label: 'COMMON', color: '#9AA3AF' },
  rare: { label: 'RARE', color: '#4F8DF5' },
  epic: { label: 'EPIC', color: '#A66CFF' },
  legendary: { label: 'LEGENDARY', color: '#F5A623' },
  mythic: { label: 'MYTHIC', color: '#FF4F5E' },
  special: { label: 'SPECIAL', color: '#2EE6C5' },
};
const TIER_RARITY = { Iron: 'rare', Bronze: 'rare', Silver: 'epic', Gold: 'epic', Platinum: 'legendary', Emerald: 'legendary', Diamond: 'legendary', Master: 'mythic', Grandmaster: 'mythic', Challenger: 'mythic' };

// The words on a certificate, in the language its theme speaks; the `Sub` lines repeat a heading in English.
const CERT_WORDS = {
  en: { title: 'PAYOUT', titleSub: 'CERTIFICATE', funded: 'FUNDED ACCOUNT', honor: 'PROUDLY AWARDED TO', amount: 'PAYMENT AMOUNT', paid: 'PAID ON' },
  ja: { title: '出金証明書', titleSub: '(PAYOUT CERTIFICATE)', funded: 'ファンデッド口座', honor: 'あなたの努力を称えて', honorSub: '(PROUDLY AWARDED TO)', amount: '支払金額', amountSub: '(PAYMENT AMOUNT)', paid: '支払日' },
  vi: { title: 'CHỨNG NHẬN', titleSub: 'RÚT LỢI NHUẬN', funded: 'TÀI KHOẢN QUỸ', honor: 'TRÂN TRỌNG TRAO TẶNG', honorSub: '(PROUDLY AWARDED TO)', amount: 'SỐ TIỀN NHẬN', amountSub: '(PAYMENT AMOUNT)', paid: 'NGÀY NHẬN' },
  es: { title: 'CERTIFICADO', titleSub: 'DE PAGO', funded: 'CUENTA FONDEADA', honor: 'OTORGADO CON ORGULLO A', honorSub: '(PROUDLY AWARDED TO)', amount: 'MONTO PAGADO', amountSub: '(PAYMENT AMOUNT)', paid: 'PAGADO EL' },
};

// The skins. Each picture is art/cert/<key>.jpg. fx / fy: where the subject sits in the picture (0-1); tx / ty:
// where it should land on the certificate; zoom: how far to close in. The words sit on a wash from `panel`'s side.
// layout: 'left' / 'right' (a column of words on that side; panel: 'right' says the same) or 'center' (for a
// picture with something on both sides). font: see CERT_FONTS. sig: what the signature is set on ('note',
// 'paper', 'pixel'). seal: the words on an award rosette. autograph: a word signed across the picture.
// blocks: the words in small groups at set points of the 1500 x 1075 frame (see drawBlockWords), for a picture
// whose own words must stay readable; contain: true shows the picture's whole width.
// design: 'payouts' draws a picture-less certificate of its own (see drawPayoutsCertificate).
// portrait: an upright picture shown whole (the full height, at the right), on a blurred copy of itself.
// special: open to everyone, outside the ranks. upload: the picture is one you upload (see setCertPicture). wash: how strongly the words' side is veiled (0-1).
// light: a light picture, with dark words on a pale wash. emoji: the anime skin only: the mascot with a face, by
// the brand and beside the signature, dressed as `mood` says. Every other skin has the brand as words only.
const CERT_SKINS = [
  { key: 'classic', name: 'True Vision', tier: '', mood: 'happy', accent: '#7FB2FF', motto: 'Discipline pays. Literally.' },
  // Iron
  { key: 'soy-point', font: 'comic', name: 'Soy Point', tier: 'Iron', mood: 'shock', light: true, accent: '#2F6BFF', fx: 0.75, fy: 0.5, motto: 'Look. At. This. Payout.' },
  { key: 'iron-grip', layout: 'center', font: 'comic', name: 'Iron Grip', tier: 'Iron', mood: 'sweat', light: true, accent: '#D94A4A', fx: 0.5, motto: 'Held the stop. Kept the grip.' },
  { key: 'posture-check', font: 'hand', name: 'Posture Check', tier: 'Iron', mood: 'determined', light: true, accent: '#2B4FD8', fx: 0.52, tx: 0.68, motto: 'Sit up straight. You are funded now.' },
  // Bronze
  { key: 'stonks', font: 'mono', name: 'Stonks', tier: 'Bronze', mood: 'stonks', accent: '#FF9A1F', paper: '8,18,52', panel: 'right', fx: 0.3, tx: 0.3, motto: 'Number go up.' },
  { key: 'toi-bi-ngu', name: 'Tôi Bị Ngu', tier: 'Bronze', mood: 'zen', light: true, accent: '#2E9E44', panel: 'right', fx: 0.42, tx: 0.36, motto: 'Đừng bắt tôi làm gì. Tôi chỉ rút tiền.' },
  { key: 'flying-cow', font: 'comic', name: 'Flying Cow', tier: 'Bronze', mood: 'splash', light: true, accent: '#0E9A9A', panel: 'right', fx: 0.27, tx: 0.3, motto: 'Cows can fly. So can your account.' },
  // Silver
  { key: 'birthday-unicorn', font: 'hand', name: 'Birthday Unicorn', tier: 'Silver', mood: 'party', light: true, accent: '#E0559A', panel: 'right', fx: 0.45, tx: 0.33, motto: 'Rare as a unicorn. Paid like one.' },
  { key: 'life', name: 'Life', tier: 'Silver', mood: 'zen', light: true, accent: '#3E8E3E', zoom: 1.15, fx: 0.65, tx: 0.7, fy: 0.4, ty: 0.45, motto: 'life is good. payout is better.' },
  { key: 'majestic-cat', font: 'serif', name: 'Majestic Cat', tier: 'Silver', mood: 'cat', accent: '#FF8C7A', paper: '20,10,18', zoom: 1.15, fx: 0.55, tx: 0.68, fy: 0.55, ty: 0.55, motto: 'Majestic. Funded. Unbothered.' },
  // Gold
  { key: 'ca-phe-sua', name: 'Cà Phê Sữa', tier: 'Gold', mood: 'coffee', accent: '#D6A15E', paper: '18,12,8', zoom: 1.1, fx: 0.55, tx: 0.68, fy: 0.4, ty: 0.42, motto: 'Gặp lệnh xanh không hiếm, gặp quỹ chịu trả payout mới hiếm.' },
  { key: 'saigon-noir', font: 'serif', name: 'Saigon Noir', tier: 'Gold', mood: 'noir', light: true, accent: '#8C6A48', paper: '240,236,228', fx: 0.58, tx: 0.68, motto: 'Trường Giang tới chơi.' },
  { key: 'golden-doge', layout: 'center', font: 'comic', name: 'Golden Hour', tier: 'Gold', mood: 'dog', accent: '#F2C14E', paper: '22,14,4', fx: 0.5, motto: 'Much payout. Very wow.' },
  // Platinum
  { key: 'nghin-ty', blocks: {
    brand: [88, 100], title: [88, 222, true], pill: [88, 250], motto: [88, 350], honor: [88, 712], amount: [88, 834], sig: [1060, 985],
    washes: [[400, 220, 560, 210], [310, 860, 330, 250], [1230, 1000, 300, 110]] }, name: 'Nghìn Tỷ', tier: 'Platinum', mood: 'rich', light: true, accent: '#C9302C', fx: 0.78, tx: 0.78, fy: 0.4, ty: 0.42, motto: 'Không có nổi 1000 tỷ… nhưng có payout.' },
  { key: 'co-len', blocks: {
    contain: true, brand: [88, 100], title: [610, 196], pill: [610, 262], motto: [88, 716], honor: [88, 780], amount: [640, 780], sig: [88, 985],
    washes: [[300, 100, 320, 100], [820, 230, 330, 150], [560, 840, 760, 250], [560, 720, 620, 90]] }, name: 'Cố Lên', tier: 'Platinum', mood: 'cheer', light: true, accent: '#2E7D32', fx: 0.75, tx: 0.76, fy: 0.3, ty: 0.32, motto: 'Cố lên! Payout tiếp theo đang tới.' },
  { key: 'choose-peace', font: 'serif', name: 'Choose Peace', tier: 'Platinum', mood: 'zen', accent: '#B8E986', paper: '6,20,12', fx: 0.6, tx: 0.66, motto: 'choose peace. take profit.' },
  // Emerald
  { key: 'genius-lab', font: 'mono', name: 'Genius Lab', tier: 'Emerald', mood: 'genius', accent: '#7FD4FF', zoom: 1.2, fx: 0.62, tx: 0.72, fy: 0.45, ty: 0.5, motto: 'Edge is just applied science.' },
  { key: 'albiceleste', font: 'poster', autograph: 'Goat', name: 'Albiceleste', tier: 'Emerald', mood: 'football', accent: '#6CACE4', paper: '8,16,32', zoom: 1.1, fx: 0.47, tx: 0.66, fy: 0.4, ty: 0.42, motto: 'Vamos. Otro pago.' },
  { key: 'hero-hour', font: 'poster', name: 'Hero Hour', tier: 'Emerald', mood: 'hero', accent: '#F0B33E', paper: '20,10,6', fx: 0.58, tx: 0.7, fy: 0.35, ty: 0.38, motto: 'Suit up. Cash out.' },
  // Diamond
  { key: 'lone-wolf', font: 'serif', name: 'Lone Wolf', tier: 'Diamond', mood: 'wolf', accent: '#A9C1E8', zoom: 1.4, fx: 0.45, tx: 0.7, fy: 0.4, ty: 0.5, motto: 'Trades alone. Wins anyway.' },
  { key: 'night-watch', font: 'serif', name: 'Night Watch', tier: 'Diamond', mood: 'bandage', accent: '#9DB8FF', paper: '4,8,30', panel: 'right', fx: 0.36, tx: 0.32, motto: 'Struggled through the night. Paid at dawn.' },
  { key: 'above-clouds', name: 'Above the Clouds', tier: 'Diamond', mood: 'joy', accent: '#8FD0FF', paper: '4,14,44', fx: 0.5, tx: 0.66, motto: 'Above the noise.' },
  // Master
  { key: 'kawaii', emoji: true, name: 'Kawaii', tier: 'Master', mood: 'love', lang: 'ja', accent: '#FF6FA5', paper: '22,10,18', zoom: 1.15, fx: 0.5, tx: 0.68, fy: 0.45, ty: 0.45, motto: 'がんばったね！ (You did it!)' },
  { key: 'ronin', font: 'serif', name: 'Ronin', tier: 'Master', mood: 'samurai', lang: 'ja', light: true, accent: '#8B1E1E', paper: '244,241,236', panel: 'right', fx: 0.32, tx: 0.3, motto: '一刀一利 — one cut, one profit.' },
  { key: 'fuji', font: 'serif', name: 'Fuji', tier: 'Master', mood: 'sakura', lang: 'ja', accent: '#BFE3FF', paper: '6,14,30', fx: 0.58, tx: 0.66, motto: '静かな心、確かな利益 (calm mind, sure profit)' },
  // Grandmaster
  { key: 'overall-payouts', name: 'Overall Payouts', tier: 'Grandmaster', design: 'payouts', accent: '#E7C27D' },
  { key: 'night-drive', name: 'Night Drive', tier: 'Grandmaster', accent: '#E53935', paper: '10,10,12', wash: 0.7, fx: 0.7, tx: 0.72, motto: 'No payout, no Porsche.' },
  { key: 'house-edge', name: 'House Edge', tier: 'Grandmaster', font: 'serif', accent: '#F2B33D', paper: '16,14,18', zoom: 1.25, fx: 0.5, tx: 0.64, motto: 'The house has an edge. So do you.' },
  // Challenger
  { key: 'evolution', name: 'Evolution of Money', tier: 'Challenger', font: 'serif', light: true, accent: '#1F6F43', paper: '250,240,215', fx: 0.6, tx: 0.66, motto: 'From money bags to market orders.' },
  { key: 'chart-wizard', name: 'Chart Wizard', tier: 'Challenger', font: 'mono', accent: '#39FF6A', paper: '6,10,24', panel: 'right', fx: 0.25, tx: 0.25, motto: 'Drew 47 lines. One of them worked.' },
  { key: 'horizon', name: 'Horizon', tier: 'Challenger', font: 'serif', accent: '#BFE3FF', paper: '10,30,60', fx: 0.74, tx: 0.76, motto: 'Calm seas. Clean payout.' },
  // Special: open to everyone, whatever the rank
  { key: 'uno-reverse', name: 'Uno Reverse', tier: '', special: true, font: 'comic', light: true, accent: '#D7263D', paper: '248,244,252', fx: 0.62, tx: 0.68, motto: 'The market tried. I played the reverse card.' },
  { key: 'zero-sugar', name: 'Zero Sugar', tier: '', special: true, font: 'serif', light: true, accent: '#4A5A68', fx: 0.62, tx: 0.66, motto: 'Zero sugar, zero payout.' },
  { key: 'two-weeks', name: 'Two Weeks Notice', tier: '', special: true, accent: '#E8556D', paper: '24,14,10', zoom: 1.35, fx: 0.5, tx: 0.66, fy: 0.35, ty: 0.4, motto: 'Application denied. Payout approved.' },
  { key: 'mugshot-kawaii', name: 'Mugshot Kawaii', tier: '', special: true, font: 'comic', accent: '#FF6FA5', paper: '40,14,30', zoom: 1.3, fx: 0.5, tx: 0.68, motto: 'Took the L. Then took the payout.' },
  { key: 'toc-vang', name: 'Tóc Vàng', tier: '', special: true, accent: '#F5C518', paper: '20,16,8', portrait: true, motto: 'Độ Paid' },
  { key: 'your-picture', name: 'Your Picture', tier: '', special: true, upload: true, accent: '#FFFFFF', paper: '8,8,12', fx: 0.6, tx: 0.66, motto: '' },
];

// The certificate pictures, loaded from the plugin's art/cert folder (see loadBundledArt): { <skin key>: image }.
let CERT_ART = {};

const certRarity = (skin) => (skin.special ? 'special' : skin.tier ? TIER_RARITY[skin.tier] : 'common');
const tierFrom = (name) => (TIERS.find((t) => t.name === name) || { from: 0 }).from;
/** Which certificate skins a rank has opened: the free one, then three with each tier. */
const unlockedCertSkins = (rank) => CERT_SKINS.filter((k) => VIP || !k.tier || (rank && rank.ranked && rank.score >= tierFrom(k.tier)));

// How the mascot is dressed for each theme: its eyes, its mouth and what it carries.
const MOODS = {
  happy: { eyes: 'anime', mouth: 'w' },
  shock: { eyes: 'wide', mouth: 'o', extras: ['bang'] },
  sweat: { eyes: 'anime', mouth: 'wave', extras: ['sweat'] },
  determined: { eyes: 'fierce', mouth: 'flat', extras: ['headband'] },
  stonks: { eyes: 'none', mouth: 'smirk', extras: ['shades', 'tie', 'arrow'] },
  zen: { eyes: 'closed', mouth: 'w', extras: ['halo'] },
  splash: { eyes: 'anime', mouth: 'grin', extras: ['drops'] },
  party: { eyes: 'closed', mouth: 'grin', extras: ['partyhat'] },
  cat: { eyes: 'anime', mouth: 'w', extras: ['catears'] },
  coffee: { eyes: 'closed', mouth: 'w', extras: ['coffee'] },
  noir: { eyes: 'none', mouth: 'smirk', extras: ['roundshades'] },
  dog: { eyes: 'anime', mouth: 'w', extras: ['dogears'] },
  rich: { eyes: 'dollar', mouth: 'grin', extras: ['diamond'] },
  cheer: { eyes: 'closed', mouth: 'grin', extras: ['headband'], mitts: 'fists' },
  genius: { eyes: 'anime', mouth: 'o', extras: ['glasses', 'sparks'] },
  football: { eyes: 'anime', mouth: 'grin', extras: ['ball'] },
  hero: { eyes: 'none', mouth: 'smirk', extras: ['shades', 'burger'] },
  wolf: { eyes: 'fierce', mouth: 'fang', extras: ['wolfears'] },
  bandage: { eyes: 'fierce', mouth: 'flat', extras: ['bandage', 'stars'] },
  joy: { eyes: 'closed', mouth: 'grin', mitts: 'up' },
  love: { eyes: 'heart', mouth: 'w', extras: ['hearts'] },
  samurai: { eyes: 'fierce', mouth: 'flat', extras: ['topknot'] },
  sakura: { eyes: 'closed', mouth: 'w', extras: ['petals'] },
};

/** True Vision's own mascot: a glossy ink-black orb with anime eyes, rosy cheeks and little white mitts, drawn
 *  with the canvas so it scales to any size. (`mood`: see MOODS.) Everything is laid out in units of `r`. */
function drawMascot(g, cx, cy, r, mood) {
  const m = MOODS[mood] || MOODS.happy;
  const has = (x) => (m.extras || []).includes(x);
  g.save();
  g.translate(cx, cy);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const oval = (x, y, rx, ry, fill, rot = 0) => { g.beginPath(); g.ellipse(x * r, y * r, rx * r, ry * r, rot, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  const path = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * r, y * r) : g.moveTo(x * r, y * r))); };
  const poly = (pts, fill) => { path(pts); g.closePath(); g.fillStyle = fill; g.fill(); };
  const line = (pts, color, width) => { path(pts); g.strokeStyle = color; g.lineWidth = width * r; g.stroke(); };
  const heart = (x, y, s, fill) => {
    g.beginPath();
    g.moveTo(x * r, (y + s * 0.35) * r);
    g.bezierCurveTo((x - s) * r, (y - s * 0.25) * r, (x - s * 0.45) * r, (y - s) * r, x * r, (y - s * 0.4) * r);
    g.bezierCurveTo((x + s * 0.45) * r, (y - s) * r, (x + s) * r, (y - s * 0.25) * r, x * r, (y + s * 0.35) * r);
    g.fillStyle = fill;
    g.fill();
  };
  const star = (x, y, s, fill) => poly([[x, y - s], [x + s * 0.25, y - s * 0.25], [x + s, y], [x + s * 0.25, y + s * 0.25], [x, y + s], [x - s * 0.25, y + s * 0.25], [x - s, y], [x - s * 0.25, y - s * 0.25]], fill);

  // behind the head
  if (has('halo')) { g.strokeStyle = 'rgba(255,224,130,0.95)'; g.lineWidth = r * 0.07; g.beginPath(); g.ellipse(0, -r * 1.12, r * 0.5, r * 0.13, 0, 0, Math.PI * 2); g.stroke(); }
  if (has('wolfears')) for (const s of [-1, 1]) { poly([[s * 0.86, -0.3], [s * 0.64, -1.3], [s * 0.12, -0.84]], '#1c1e26'); poly([[s * 0.68, -0.5], [s * 0.6, -1.04], [s * 0.3, -0.8]], '#F2A7B8'); }
  if (has('catears')) for (const s of [-1, 1]) { poly([[s * 0.9, -0.36], [s * 0.74, -1.16], [s * 0.26, -0.86]], '#1c1e26'); poly([[s * 0.76, -0.52], [s * 0.7, -0.96], [s * 0.42, -0.8]], '#F7B6C8'); }
  if (has('dogears')) for (const s of [-1, 1]) oval(s * 0.9, 0.02, 0.22, 0.46, '#C8873E', s * 0.35);
  if (has('topknot')) { oval(0, -1.06, 0.22, 0.19, '#0e0e12'); line([[-0.13, -0.9], [0.13, -0.9]], '#B32A2A', 0.08); }
  if (has('sparks')) for (const [a, k] of [[-2.55, 1], [-2.05, 0.8], [-1.1, 0.85], [-0.55, 1]]) {
    const x0 = Math.cos(a) * 1.15, y0 = Math.sin(a) * 1.15, dx = Math.cos(a) * 0.42 * k, dy = Math.sin(a) * 0.42 * k;
    line([[x0, y0], [x0 + dx * 0.5 + 0.1, y0 + dy * 0.5], [x0 + dx, y0 + dy]], '#FFE066', 0.07);
  }

  // the head: a glossy black orb
  const body = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r);
  body.addColorStop(0, '#3c3f4c');
  body.addColorStop(0.55, '#15161c');
  body.addColorStop(1, '#040406');
  oval(0, 0, 1, 1, body);
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = Math.max(1, r * 0.03);
  g.beginPath();
  g.arc(0, 0, r * 0.985, 0, Math.PI * 2);
  g.stroke();
  oval(-0.42, -0.56, 0.27, 0.12, 'rgba(255,255,255,0.33)', -0.6);

  // cheeks, with the little lines anime draws on a blush
  for (const s of [-1, 1]) {
    oval(s * 0.57, 0.25, 0.16, 0.09, 'rgba(255,120,155,0.8)');
    for (let i = 0; i < 3; i++) line([[s * 0.57 - 0.08 + i * 0.07, 0.29], [s * 0.57 - 0.05 + i * 0.07, 0.21]], 'rgba(255,255,255,0.7)', 0.025);
  }

  // eyes
  for (const s of [-1, 1]) {
    const x = s * 0.34;
    if (m.eyes === 'anime' || m.eyes === 'fierce') {
      oval(x, 0, 0.17, 0.23, '#ffffff');
      oval(x, 0.04, 0.125, 0.17, '#3D2B7A');
      oval(x, 0.07, 0.07, 0.1, '#0d0820');
      oval(x - 0.055, -0.05, 0.05, 0.06, '#ffffff');
      oval(x + 0.05, 0.12, 0.025, 0.03, '#ffffff');
      if (m.eyes === 'fierce') line([[s * 0.55, -0.34], [s * 0.17, -0.2]], '#ffffff', 0.07);
    } else if (m.eyes === 'wide') {
      oval(x, -0.02, 0.2, 0.26, '#ffffff');
      oval(x, 0, 0.06, 0.08, '#111111');
      oval(x - 0.03, -0.03, 0.02, 0.025, '#ffffff');
    } else if (m.eyes === 'closed') {
      line([[x - 0.14, 0.05], [x, -0.08], [x + 0.14, 0.05]], '#ffffff', 0.07);
    } else if (m.eyes === 'heart') {
      heart(x, 0.02, 0.2, '#FF4F8B');
      oval(x - 0.06, -0.06, 0.035, 0.03, '#ffffff');
    } else if (m.eyes === 'dollar') {
      oval(x, 0, 0.17, 0.23, '#ffffff');
      g.font = `900 ${r * 0.34}px ${SANS}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#1E9E4A';
      g.fillText('$', x * r, 0.02 * r);
    }
  }

  // mouth
  if (m.mouth === 'w') line([[-0.14, 0.33], [-0.07, 0.4], [0, 0.33], [0.07, 0.4], [0.14, 0.33]], '#ffffff', 0.05);
  if (m.mouth === 'wave') line([[-0.16, 0.38], [-0.08, 0.33], [0, 0.38], [0.08, 0.33], [0.16, 0.38]], '#ffffff', 0.05);
  if (m.mouth === 'smirk') line([[-0.12, 0.36], [0.04, 0.38], [0.17, 0.29]], '#ffffff', 0.05);
  if (m.mouth === 'flat') line([[-0.12, 0.36], [0.12, 0.36]], '#ffffff', 0.05);
  if (m.mouth === 'o') { oval(0, 0.38, 0.09, 0.11, '#3a0d14'); oval(0, 0.43, 0.05, 0.035, '#E8667A'); }
  if (m.mouth === 'grin' || m.mouth === 'fang') {
    g.beginPath();
    g.arc(0, 0.3 * r, (m.mouth === 'grin' ? 0.17 : 0.13) * r, 0, Math.PI);
    g.closePath();
    g.fillStyle = '#3a0d14';
    g.fill();
    oval(0, 0.4, 0.07, 0.04, '#E8667A');
    if (m.mouth === 'fang') poly([[0.03, 0.3], [0.1, 0.3], [0.065, 0.4]], '#ffffff');
  }

  // what sits on the face
  if (has('shades')) {
    g.fillStyle = '#0b0b0f';
    for (const s of [-1, 1]) { g.beginPath(); g.roundRect((s * 0.34 - 0.22) * r, -0.13 * r, 0.44 * r, 0.27 * r, 0.11 * r); g.fill(); }
    line([[-0.12, -0.04], [0.12, -0.04]], '#0b0b0f', 0.06);
    for (const s of [-1, 1]) line([[s * 0.34 - 0.13, -0.06], [s * 0.34 - 0.04, -0.06]], 'rgba(255,255,255,0.55)', 0.035);
  }
  if (has('roundshades') || has('glasses')) {
    const tinted = has('roundshades');
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(s * 0.34 * r, 0.01 * r, 0.21 * r, 0, Math.PI * 2);
      if (tinted) { g.fillStyle = '#121014'; g.fill(); }
      g.strokeStyle = tinted ? '#C9A45C' : '#E8E8EE';
      g.lineWidth = 0.045 * r;
      g.stroke();
    }
    line([[-0.13, -0.02], [0.13, -0.02]], tinted ? '#C9A45C' : '#E8E8EE', 0.04);
    if (tinted) for (const s of [-1, 1]) line([[s * 0.34 - 0.1, -0.07], [s * 0.34 - 0.03, -0.11]], 'rgba(255,255,255,0.6)', 0.03);
  }
  if (has('headband')) {
    g.save();
    g.beginPath();
    g.arc(0, 0, r * 0.99, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#D7263D';
    g.fillRect(-r, -0.66 * r, 2 * r, 0.2 * r);
    g.restore();
    poly([[0.9, -0.6], [1.3, -0.78], [1.22, -0.5]], '#D7263D');
    poly([[0.9, -0.52], [1.24, -0.4], [1.08, -0.3]], '#B81E33');
  }
  if (has('bandage')) {
    g.save();
    g.translate(-0.55 * r, 0.02 * r);
    g.rotate(-0.5);
    g.fillStyle = '#F3D9B1';
    g.beginPath();
    g.roundRect(-0.18 * r, -0.06 * r, 0.36 * r, 0.12 * r, 0.05 * r);
    g.fill();
    g.restore();
  }
  // the TV mark on the forehead (on the band when there is one)
  g.font = `800 ${r * 0.24}px ${DISPLAY}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillText('TV', 0, -0.555 * r);

  // things above, around and in front
  if (has('partyhat')) {
    poly([[-0.34, -0.84], [0.32, -0.84], [0.06, -1.66]], '#FF6FB5');
    line([[-0.24, -1.02], [0.24, -1.02]], '#FFE066', 0.06);
    line([[-0.13, -1.27], [0.17, -1.27]], '#7FD4FF', 0.06);
    oval(0.06, -1.7, 0.11, 0.11, '#FFE066');
  }
  if (has('sweat')) { poly([[0.86, -0.78], [0.98, -0.48], [0.74, -0.48]], '#7EC8FF'); oval(0.86, -0.46, 0.12, 0.1, '#7EC8FF'); }
  if (has('bang')) { g.font = `900 ${r * 0.6}px ${SANS}`; g.fillStyle = '#FF4F5E'; g.fillText('!!', 1.18 * r, -0.72 * r); }
  if (has('hearts')) for (const [x, y, s] of [[1.12, -0.72, 0.2], [-1.12, -0.46, 0.15], [1.28, -0.2, 0.12]]) heart(x, y, s, '#FF6FA5');
  if (has('stars')) for (const [x, y, s] of [[1.15, -0.8, 0.14], [-1.15, -0.6, 0.11], [1.32, -0.25, 0.09]]) star(x, y, s, '#FFF2B3');
  if (has('petals')) for (const [x, y, a] of [[1.12, -0.7, 0.4], [-1.15, -0.4, -0.6], [1.3, -0.1, 1.2], [-0.9, -1.0, 0.2]]) oval(x, y, 0.1, 0.06, '#FFB7CF', a);
  if (has('drops')) for (const [x, y, s] of [[1.1, -0.6, 0.09], [-1.12, -0.3, 0.07], [1.25, -0.15, 0.06]]) { poly([[x, y - s * 2], [x + s, y], [x - s, y]], '#5EC8F0'); oval(x, y, s, s * 0.9, '#5EC8F0'); }
  if (has('tie')) { oval(0, 1.0, 0.1, 0.08, '#2C6BE0'); poly([[-0.07, 1.04], [0.07, 1.04], [0.13, 1.4], [0, 1.54], [-0.13, 1.4]], '#2C6BE0'); }
  if (has('arrow')) {
    line([[0.95, 0.95], [1.25, 0.55], [1.38, 0.68], [1.7, 0.1]], '#FF9A1F', 0.12);
    poly([[1.82, -0.1], [1.84, 0.28], [1.52, 0.12]], '#FF9A1F');
  }
  if (has('diamond')) {
    poly([[0.86, 0.45], [1.3, 0.45], [1.42, 0.62], [1.08, 1.05], [0.74, 0.62]], '#9FE6FF');
    line([[0.74, 0.62], [1.42, 0.62]], 'rgba(255,255,255,0.8)', 0.03);
    line([[0.98, 0.45], [0.92, 0.62], [1.08, 1.05], [1.24, 0.62], [1.18, 0.45]], 'rgba(255,255,255,0.6)', 0.025);
  }
  if (has('coffee')) {
    poly([[0.62, 0.42], [1.06, 0.42], [1.0, 1.1], [0.68, 1.1]], 'rgba(255,255,255,0.28)');
    poly([[0.66, 0.78], [1.02, 0.78], [1.0, 1.1], [0.68, 1.1]], '#5A3416');
    poly([[0.64, 0.6], [1.04, 0.6], [1.02, 0.78], [0.66, 0.78]], '#D9B48A');
    for (const [x, y] of [[0.76, 0.5], [0.92, 0.54]]) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect((x - 0.06) * r, (y - 0.06) * r, 0.12 * r, 0.12 * r); }
    line([[0.62, 0.42], [1.06, 0.42]], 'rgba(255,255,255,0.8)', 0.03);
  }
  if (has('ball')) {
    oval(1.02, 0.78, 0.3, 0.3, '#ffffff');
    poly([[1.02, 0.66], [1.13, 0.74], [1.09, 0.87], [0.95, 0.87], [0.91, 0.74]], '#15161c');
    for (const a of [0, 1.26, 2.51, 3.77, 5.03]) oval(1.02 + Math.cos(a - 1.57) * 0.25, 0.78 + Math.sin(a - 1.57) * 0.25, 0.06, 0.05, '#15161c', a);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 0.02 * r;
    g.beginPath();
    g.arc(1.02 * r, 0.78 * r, 0.3 * r, 0, Math.PI * 2);
    g.stroke();
  }
  if (has('burger')) {
    g.beginPath(); g.ellipse(1.05 * r, 0.62 * r, 0.32 * r, 0.22 * r, 0, Math.PI, 0); g.fillStyle = '#E0A050'; g.fill();
    for (const [x, y] of [[0.95, 0.52], [1.08, 0.48], [1.18, 0.55]]) oval(x, y, 0.025, 0.015, '#FFF1C9');
    line([[0.74, 0.66], [0.85, 0.7], [0.96, 0.65], [1.07, 0.7], [1.18, 0.65], [1.36, 0.68]], '#5DBB4A', 0.07);
    oval(1.05, 0.76, 0.31, 0.07, '#6B3A1E');
    g.beginPath(); g.ellipse(1.05 * r, 0.84 * r, 0.31 * r, 0.1 * r, 0, 0, Math.PI); g.fillStyle = '#D89448'; g.fill();
  }

  // mitts
  const mitts = m.mitts === 'up' ? [[-1.12, -0.55], [1.12, -0.55]] : m.mitts === 'fists' ? [[-0.98, -0.05], [0.98, -0.05]] : [[-0.8, 0.74], [0.8, 0.74]];
  for (const [x, y] of mitts) {
    oval(x, y, 0.2, 0.18, '#ffffff');
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 0.025 * r;
    g.beginPath();
    g.ellipse(x * r, y * r, 0.2 * r, 0.18 * r, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

// The type a skin's words are set in, so the words belong to the picture: a hand for a sketch, a comic hand for a
// meme, a book face for a painting or a portrait, a terminal face for a chart, a poster face for a hero.
const CERT_FONTS = {
  sans: SANS,
  hand: "'Segoe Print', 'Ink Free', 'Marker Felt', 'Chalkboard SE', 'Comic Sans MS', cursive",
  comic: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', 'Segoe Print', cursive",
  serif: "Georgia, 'Times New Roman', 'Iowan Old Style', serif",
  mono: "Consolas, 'Courier New', Menlo, monospace",
  poster: DISPLAY,
};

/** The CEO's signature at (x, y) = the signature's baseline: True Vision in a slanted hand with a flourish, then
 *  CEO, FOUNDER and TRUE VISION · TRUE JOURNAL. `box` sets it on something: a sticky note, a torn scrap of paper,
 *  a terminal window; the words then take that thing's own ink. */
function drawCertSignature(g, x, y, box, ink, faint) {
  const w = 360, h = 138, bx = x - 26, by = y - 72;
  g.save();
  if (box === 'note') {
    g.translate(bx + w / 2, by + h / 2);
    g.rotate(-0.025);
    g.shadowColor = 'rgba(0,0,0,0.3)';
    g.shadowBlur = 18;
    g.shadowOffsetY = 8;
    g.fillStyle = '#F6E05E';
    g.fillRect(-w / 2, -h / 2, w, h);
    ink = '#1d1a10';
    faint = 'rgba(29,26,16,0.6)';
  } else if (box === 'paper') {
    // a scrap torn on every side: the edge wanders a little, the same way each time
    let seed = 11;
    const jag = () => { seed = (seed * 9301 + 49297) % 233280; return (seed / 233280 - 0.5) * 9; };
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push([bx + (w * i) / 12, by + jag()]);
    for (let i = 1; i <= 5; i++) pts.push([bx + w + jag(), by + (h * i) / 5]);
    for (let i = 11; i >= 0; i--) pts.push([bx + (w * i) / 12, by + h + jag()]);
    for (let i = 4; i >= 1; i--) pts.push([bx + jag(), by + (h * i) / 5]);
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.closePath();
    g.shadowColor = 'rgba(0,0,0,0.28)';
    g.shadowBlur = 14;
    g.shadowOffsetY = 6;
    g.fillStyle = '#FBFAF6';
    g.fill();
    ink = '#17140F';
    faint = 'rgba(23,20,15,0.55)';
  } else if (box === 'pixel') {
    g.fillStyle = 'rgba(4,10,6,0.92)';
    g.fillRect(bx, by, w, h);
    g.strokeStyle = '#39FF6A';
    g.lineWidth = 5;
    g.strokeRect(bx, by, w, h);
    g.strokeRect(bx + w - 30, by + 10, 18, 18);
    ink = '#E6FFE9';
    faint = 'rgba(150,255,170,0.7)';
  }
  g.restore();
  g.save();
  g.translate(x + 6, y);
  g.rotate(-0.07);
  g.transform(1, 0, -0.2, 1, 0, 0);
  const hand = (px) => `400 ${px}px 'Snell Roundhand', 'Savoye LET', 'Apple Chancery', 'Segoe Script', 'Brush Script MT', cursive`;
  let sig = 52;
  g.font = hand(sig);
  while (g.measureText('True Vision').width > 280 && sig > 30) { sig -= 2; g.font = hand(sig); }
  const sw = g.measureText('True Vision').width;
  g.textAlign = 'left';
  g.fillStyle = ink;
  g.fillText('True Vision', 0, 0);
  g.strokeStyle = ink;
  g.lineCap = 'round';
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(-10, 12);
  g.bezierCurveTo(sw * 0.28, 28, sw * 0.72, 18, sw + 14, -3);
  g.bezierCurveTo(sw + 28, -13, sw + 10, -22, sw - 14, 4);
  g.stroke();
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(sw * 0.18, 21);
  g.quadraticCurveTo(sw * 0.5, 31, sw * 0.86, 18);
  g.stroke();
  g.restore();
  g.save();
  g.textAlign = 'left';
  g.letterSpacing = '4px';
  g.font = `800 15px ${SANS}`;
  g.fillStyle = ink;
  g.fillText('CEO, FOUNDER', x, y + 42);
  g.font = `600 12px ${SANS}`;
  g.fillStyle = faint;
  g.fillText('TRUE VISION · TRUE JOURNAL', x, y + 64);
  g.restore();
}

/** An award rosette: a gold scalloped seal on two ribbons in the skin's colour, its words in two lines. */
function drawSeal(g, cx, cy, r, words, accent) {
  g.save();
  g.translate(cx, cy);
  g.rotate(0.16);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * r * 0.3, r * 0.45);
    g.lineTo(s * r * 0.78, r * 1.62);
    g.lineTo(s * r * 0.47, r * 1.42);
    g.lineTo(s * r * 0.22, r * 1.7);
    g.lineTo(s * r * 0.02, r * 0.6);
    g.closePath();
    g.fillStyle = accent;
    g.fill();
  }
  g.beginPath();
  for (let i = 0; i <= 56; i++) {
    const a = (i / 56) * Math.PI * 2, rr = r * (i % 2 ? 0.92 : 1);
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 16;
  g.shadowOffsetY = 6;
  g.fillStyle = '#E3B341';
  g.fill();
  g.shadowColor = 'transparent';
  g.beginPath();
  g.arc(0, 0, r * 0.76, 0, Math.PI * 2);
  g.fillStyle = '#F4D27A';
  g.fill();
  g.strokeStyle = '#B8892E';
  g.lineWidth = 3;
  g.stroke();
  const parts = String(words).split(' ');
  const lines = parts.length > 1 ? [parts.slice(0, Math.ceil(parts.length / 2)).join(' '), parts.slice(Math.ceil(parts.length / 2)).join(' ')] : [words];
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#5A3B0A';
  lines.forEach((line, i) => {
    let px = r * 0.34;
    g.font = `800 ${px}px Georgia, serif`;
    while (g.measureText(line).width > r * 1.3 && px > 8) { px -= 1; g.font = `800 ${px}px Georgia, serif`; }
    g.fillText(line, 0, lines.length === 1 ? 0 : (i ? 1 : -1) * r * 0.19);
  });
  g.restore();
}

/** A word signed across the picture like an autograph: in the signature hand, large, with a swash under it. */
function drawAutograph(g, cx, cy, word, color) {
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.14);
  g.transform(1, 0, -0.2, 1, 0, 0);
  g.font = "400 112px 'Snell Roundhand', 'Savoye LET', 'Apple Chancery', 'Segoe Script', 'Brush Script MT', cursive";
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 10;
  g.fillStyle = color;
  g.fillText(word, 0, 0);
  const w = g.measureText(word).width;
  g.strokeStyle = color;
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-w / 2 - 20, 26);
  g.bezierCurveTo(-w * 0.1, 46, w * 0.3, 34, w / 2 + 30, 4);
  g.bezierCurveTo(w / 2 + 50, -10, w / 2 + 24, -24, w / 2 - 6, 8);
  g.stroke();
  g.restore();
}

/** The certificate's words in small groups at the points `b` gives (see CERT_SKINS' blocks), each on a soft wash:
 *  brand [x, baseline], title [x, baseline, on one line], pill [x, top], motto, honor (then the name),
 *  amount (then the figure and the date), sig — every one [x, baseline]. */
function drawBlockWords(g, b, skin, words, data, face, ink, soft, faint, paper) {
  for (const [cx, cy, rx, ry] of b.washes || []) {
    g.save();
    g.translate(cx, cy);
    g.scale(rx / ry, 1);
    const wash = g.createRadialGradient(0, 0, 0, 0, 0, ry);
    wash.addColorStop(0, `rgba(${paper},0.82)`);
    wash.addColorStop(0.55, `rgba(${paper},0.6)`);
    wash.addColorStop(1, `rgba(${paper},0)`);
    g.fillStyle = wash;
    g.fillRect(-ry, -ry, 2 * ry, 2 * ry);
    g.restore();
  }
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const put = (s, x, y, font, color, spacing = '0px', max = 0) => {
    g.font = font;
    g.letterSpacing = spacing;
    let out = String(s);
    while (max && out.length > 1 && g.measureText(out).width > max) out = `${out.slice(0, -2)}…`;
    g.fillStyle = color;
    g.fillText(out, x, y);
    g.letterSpacing = '0px';
  };
  const sized = (s, weight, size, max) => {
    let px = size;
    g.font = `${weight} ${px}px ${face}`;
    while (g.measureText(s).width > max && px > size / 2) { px -= 2; g.font = `${weight} ${px}px ${face}`; }
    return g.font;
  };
  if (b.brand) {
    put('TRUE VISION', b.brand[0], b.brand[1], `800 40px ${SANS}`, ink, '1px');
    put('JOURNAL', b.brand[0] + 2, b.brand[1] + 30, `600 17px ${SANS}`, soft, '9px');
  }
  if (b.title) {
    if (b.title[2]) put(`${words.title} ${words.titleSub}`, b.title[0], b.title[1], sized(`${words.title} ${words.titleSub}`, 800, 56, 820), ink);
    else {
      put(words.title, b.title[0], b.title[1], `800 66px ${face}`, ink);
      put(words.titleSub, b.title[0], b.title[1] + 36, `700 26px ${face}`, ink, '1px');
    }
  }
  if (b.pill) {
    g.font = `600 21px ${face}`;
    const pill = data.pill || `${words.funded} · ${data.account || ''}`;
    const pw = Math.min(520, g.measureText(pill).width + 42);
    g.beginPath();
    g.roundRect(b.pill[0], b.pill[1], pw, 44, 22);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fill();
    g.strokeStyle = alpha(skin.accent, 0.75);
    g.lineWidth = 2;
    g.stroke();
    put(pill, b.pill[0] + 21, b.pill[1] + 30, `600 21px ${face}`, skin.accent, '0px', pw - 42);
  }
  if (b.motto && skin.motto) put(skin.motto, b.motto[0], b.motto[1], `italic 600 26px ${face}`, skin.accent, '0px', 760);
  if (b.honor) {
    put(words.honor, b.honor[0], b.honor[1], `600 24px ${face}`, soft, '1px');
    put(data.name || 'Trader', b.honor[0], b.honor[1] + 58, sized(data.name || 'Trader', 800, 54, 470), ink, '0px', 470);
  }
  if (b.amount) {
    put(words.amount, b.amount[0], b.amount[1], `600 24px ${face}`, soft, '1px');
    const figure = money(Number(data.amount) || 0);
    put(figure, b.amount[0], b.amount[1] + 76, sized(figure, 800, 80, 470), skin.accent);
    put(`${words.paid} ${data.date || ''}${data.id ? `  ·  No. TV-${String(data.id).slice(-6).toUpperCase()}` : ''}`, b.amount[0], b.amount[1] + 110, `500 18px ${face}`, faint, '1px');
  }
  if (b.sig) drawCertSignature(g, b.sig[0], b.sig[1], skin.sig, ink, faint);
}

/** A QR-like square for decoration only (it does not scan): the three corner finders and a pattern that follows
 *  `seed`, so each payout has its own. */
function drawDecorQr(g, x, y, size, seed) {
  const n = 25, cell = size / (n + 2);
  let h = 2166136261;
  for (const ch of String(seed || 'tv')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  g.save();
  g.fillStyle = '#FFFFFF';
  g.fillRect(x, y, size, size);
  g.fillStyle = '#111114';
  const finder = (fx, fy) => {
    g.fillRect(x + (fx + 1) * cell, y + (fy + 1) * cell, 7 * cell, 7 * cell);
    g.fillStyle = '#FFFFFF';
    g.fillRect(x + (fx + 2) * cell, y + (fy + 2) * cell, 5 * cell, 5 * cell);
    g.fillStyle = '#111114';
    g.fillRect(x + (fx + 3) * cell, y + (fy + 3) * cell, 3 * cell, 3 * cell);
  };
  const inFinder = (i, j) => (i < 8 && j < 8) || (i > n - 9 && j < 8) || (i < 8 && j > n - 9);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (inFinder(i, j)) continue;
      const on = i === 6 || j === 6 ? (i + j) % 2 === 0 : rnd() > 0.52;
      if (on) g.fillRect(x + (i + 1) * cell, y + (j + 1) * cell, cell + 0.5, cell + 0.5);
    }
  }
  finder(0, 0);
  finder(n - 7, 0);
  finder(0, n - 7);
  g.restore();
}

/** The Grandmaster certificate: dark, a light diagonal band with the tier on a tab, the profit share large, the
 *  date line and the CEO's signature, and a decorative QR code. */
function drawPayoutsCertificate(g, data, skin) {
  const W = CERT_W, H = CERT_H;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2A2A2E');
  bg.addColorStop(0.45, '#1D1D21');
  bg.addColorStop(1, '#141417');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // soft diagonal sheen
  for (let i = 0; i < 7; i++) {
    g.fillStyle = `rgba(255,255,255,${0.012 + (i % 2) * 0.01})`;
    g.beginPath();
    g.moveTo(-200 + i * 260, H);
    g.lineTo(200 + i * 260, 0);
    g.lineTo(330 + i * 260, 0);
    g.lineTo(-70 + i * 260, H);
    g.fill();
  }
  // the band across, and the tab that names the tier
  const bandY = 400;
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.beginPath();
  g.moveTo(0, bandY - 50);
  g.lineTo(W * 0.62, bandY - 50);
  g.lineTo(W * 0.66, bandY - 10);
  g.lineTo(W, bandY - 10);
  g.lineTo(W, bandY + 6);
  g.lineTo(W * 0.655, bandY + 6);
  g.lineTo(W * 0.615, bandY - 34);
  g.lineTo(0, bandY - 34);
  g.closePath();
  g.fill();
  g.fillStyle = '#3A3A3F';
  g.beginPath();
  g.moveTo(W * 0.655, bandY + 6);
  g.lineTo(W, bandY + 6);
  g.lineTo(W, bandY + 96);
  g.lineTo(W * 0.69, bandY + 96);
  g.closePath();
  g.fill();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 30px ${SANS}`;
  g.letterSpacing = '6px';
  g.fillStyle = '#9A9AA2';
  g.fillText(String(skin.tier || 'GRANDMASTER').toUpperCase(), W * 0.845, bandY + 52);
  g.letterSpacing = '0px';

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const x = 110;
  // brand and title
  g.font = `800 52px ${SANS}`;
  g.letterSpacing = '3px';
  g.fillStyle = '#FFFFFF';
  g.fillText('TRUE VISION', x, 140);
  g.letterSpacing = '0px';
  g.font = `400 150px ${DISPLAY}`;
  g.fillText('OVERALL PAYOUTS', x, 300);
  // to whom, and how much
  g.font = `500 38px ${SANS}`;
  g.fillStyle = '#EDEDF0';
  g.fillText('Proudly presented to:', x, 540);
  let px = 48;
  g.font = `600 ${px}px ${SANS}`;
  while (g.measureText(data.name || 'Trader').width > 760 && px > 26) { px -= 2; g.font = `600 ${px}px ${SANS}`; }
  g.fillStyle = skin.accent;
  g.fillText(data.name || 'Trader', x, 604);
  g.font = `500 38px ${SANS}`;
  g.fillStyle = '#EDEDF0';
  g.fillText('Your profit share:', x, 690);
  const n = Number(data.amount) || 0;
  const figure = `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  px = 160;
  g.font = `800 ${px}px ${SANS}`;
  while (g.measureText(figure).width > 820 && px > 70) { px -= 4; g.font = `800 ${px}px ${SANS}`; }
  g.fillStyle = '#F4E3C3';
  g.fillText(figure, x - 6, 840);
  // date, and the signature
  const d = String(data.date || '');
  const when = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(8))} ${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : d;
  g.textAlign = 'center';
  g.fillStyle = '#EDEDF0';
  g.font = `500 32px ${SANS}`;
  g.fillText(when, 330, 955);
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 2;
  for (const [a, b] of [[150, 510], [640, 1000]]) { g.beginPath(); g.moveTo(a, 978); g.lineTo(b, 978); g.stroke(); }
  g.font = `600 20px ${SANS}`;
  g.fillStyle = '#B9B9C0';
  g.fillText('Date', 330, 1020);
  g.fillText('True Vision · CEO, FOUNDER', 820, 1020);
  g.save();
  g.translate(820, 958);
  g.rotate(-0.04);
  g.transform(1, 0, -0.18, 1, 0, 0);
  g.font = "400 54px 'Snell Roundhand', 'Savoye LET', 'Apple Chancery', 'Segoe Script', 'Brush Script MT', cursive";
  g.fillStyle = '#FFFFFF';
  g.fillText('True Vision', 0, 0);
  g.restore();
  // the decorative QR code, bottom right
  drawDecorQr(g, W - 250, H - 260, 170, data.id || data.date);
  g.textAlign = 'center';
  g.font = `600 15px ${SANS}`;
  g.letterSpacing = '3px';
  g.fillStyle = '#9A9AA2';
  g.fillText('TRUE VISION', W - 165, H - 66);
  g.letterSpacing = '0px';
}

/** A payout certificate in a skin. `data`: { name, account, amount, date, id }. Drawn in a 1500 x 1075 frame that
 *  is stretched to the canvas, so the same call makes the full picture and the small thumbnails.
 *  layout 'left' / 'right': the words in a column on that side, on a wash that fades into the picture;
 *  'center': the words in the middle (for a picture with something on both sides), the signature at the right. */
// The type faces a certificate can be set in by choice, named for the skins that use them (see CERT_FONTS).
const CERT_FONT_CHOICES = [['', "The skin's own"], ['sans', 'Clean (True Vision)'], ['hand', 'Hand (Posture Check)'], ['comic', 'Comic (Soy Point)'], ['serif', 'Book (Majestic Cat)'], ['mono', 'Terminal (Stonks)'], ['poster', 'Poster (Hero Hour)']];

/** A skin dressed the way its owner wants it: their own line in place of the motto, and their own type face. */
function dressCertSkin(skin, data) {
  const motto = String((data && data.motto) || '').trim();
  const font = data && data.font && CERT_FONTS[data.font] ? data.font : '';
  return { ...skin, ...(motto ? { motto } : {}), ...(font ? { font } : {}) };
}

function drawCertificate(canvas, data, skinKey) {
  const skin = dressCertSkin(CERT_SKINS.find((k) => k.key === skinKey) || CERT_SKINS[0], data);
  const words = { ...(CERT_WORDS[skin.lang] || CERT_WORDS.en), ...(data.titleSub ? { titleSub: data.titleSub } : {}) };
  const image = CERT_ART[skin.key] || null;
  const face = CERT_FONTS[skin.font] || SANS;
  const layout = skin.layout || (skin.panel === 'right' ? 'right' : 'left');
  const center = layout === 'center';
  const g = canvas.getContext('2d');
  const W = CERT_W, H = CERT_H;
  g.save();
  g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  if (skin.design === 'payouts') {
    drawPayoutsCertificate(g, data, skin);
    g.restore();
    return;
  }
  const light = !!skin.light;
  const ink = light ? '#17140F' : '#FFFFFF';
  const soft = light ? 'rgba(23,20,15,0.66)' : 'rgba(255,255,255,0.76)';
  const faint = light ? 'rgba(23,20,15,0.5)' : 'rgba(255,255,255,0.56)';
  const paper = skin.paper || (light ? '250,248,243' : '6,8,14');
  g.clearRect(0, 0, W, H);
  g.fillStyle = light ? '#F4F1EA' : '#070910';
  g.fillRect(0, 0, W, H);

  if (image) {
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const k = Math.max(W / iw, H / ih) * (skin.zoom || 1);
    const dw = iw * k, dh = ih * k;
    // where the picture goes so its subject lands on its mark, without ever showing an edge
    const place = (focus, target, full, drawn) => Math.min(0, Math.max(full - drawn, target * full - focus * drawn));
    const fx = skin.fx === undefined ? 0.5 : skin.fx, fy = skin.fy === undefined ? 0.5 : skin.fy;
    g.drawImage(image, place(fx, skin.tx === undefined ? fx : skin.tx, W, dw), place(fy, skin.ty === undefined ? fy : skin.ty, H, dh), dw, dh);
    if (skin.portrait) {
      // the whole upright picture at the right, full height; the cropped copy under it is blurred and dimmed
      g.save();
      g.filter = 'blur(28px) brightness(0.55)';
      g.drawImage(image, place(fx, fx, W, dw) - 40, place(fy, fy, H, dh) - 40, dw + 80, dh + 80);
      g.restore();
      const ph = H, pw = (iw * H) / ih, px = W - pw;
      g.drawImage(image, px, 0, pw, ph);
      const edge = g.createLinearGradient(px, 0, px + 160, 0);
      edge.addColorStop(0, 'rgba(0,0,0,0.55)');
      edge.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = edge;
      g.fillRect(px, 0, 160, H);
    }
    if (skin.blocks && skin.blocks.contain) {
      // the whole width of the picture at the top; below it, its own bottom edge stretched down, so the ground goes on
      const cw = W, ch = (ih * W) / iw;
      g.drawImage(image, 0, ih * 0.82, iw, ih * 0.18, 0, ch - 4, W, H - ch + 4);
      g.drawImage(image, 0, 0, cw, ch);
      const seam = g.createLinearGradient(0, ch - 60, 0, ch + 40);
      seam.addColorStop(0, 'rgba(0,0,0,0)');
      seam.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = seam;
      g.fillRect(0, ch - 60, W, 100);
    }
  } else {
    // the free skin: a night sky, and the mascot itself as the picture
    const sky = g.createLinearGradient(0, 0, W, H);
    sky.addColorStop(0, '#060B1C');
    sky.addColorStop(1, '#16306A');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; g.beginPath(); g.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 1.8, 0, Math.PI * 2); g.fill(); }
    const glow = g.createRadialGradient(1080, 520, 40, 1080, 520, 520);
    glow.addColorStop(0, 'rgba(127,178,255,0.45)');
    glow.addColorStop(1, 'rgba(127,178,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
  }

  if (skin.blocks) {
    drawBlockWords(g, skin.blocks, skin, words, data, face, ink, soft, faint, paper);
    g.restore();
    return;
  }

  // the wash the words sit on: lighter than a panel, so the picture still reads through it
  const strength = skin.wash === undefined ? (light ? 0.9 : 0.84) : skin.wash;
  if (center) {
    g.save();
    g.translate(W / 2, 560);
    g.scale(1.35, 1);
    const wash = g.createRadialGradient(0, 0, 0, 0, 0, 520);
    wash.addColorStop(0, `rgba(${paper},${strength})`);
    wash.addColorStop(0.6, `rgba(${paper},${strength * 0.72})`);
    wash.addColorStop(1, `rgba(${paper},0)`);
    g.fillStyle = wash;
    g.fillRect(-W, -H, 2 * W, 2 * H);
    g.restore();
  } else {
    const left = layout === 'left';
    const wash = g.createLinearGradient(left ? 0 : W, 0, left ? W * 0.62 : W * 0.38, 0);
    wash.addColorStop(0, `rgba(${paper},${strength})`);
    wash.addColorStop(0.5, `rgba(${paper},${strength * 0.78})`);
    wash.addColorStop(1, `rgba(${paper},0)`);
    g.fillStyle = wash;
    g.fillRect(0, 0, W, H);
  }
  const floor = g.createLinearGradient(0, H * 0.72, 0, H);
  floor.addColorStop(0, `rgba(${paper},0)`);
  floor.addColorStop(1, `rgba(${paper},0.4)`);
  g.fillStyle = floor;
  g.fillRect(0, 0, W, H);

  // where the words go
  const COL = center ? 900 : 600;
  const ax = center ? W / 2 : layout === 'left' ? 88 : W - 88 - COL;
  const align = center ? 'center' : 'left';
  if (!light) { g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 12; }
  const text = (s, y, font, color, spacing = '0px') => { g.textAlign = align; g.font = font; g.fillStyle = color; g.letterSpacing = spacing; g.fillText(s, ax, y); g.letterSpacing = '0px'; };
  // a line that must fit the column: the type shrinks (to half size at most), then the words are cut
  const fit = (s, y, weight, size, color, style = '') => {
    let px = size;
    g.textAlign = align;
    g.font = `${style}${weight} ${px}px ${face}`;
    while (g.measureText(s).width > COL && px > size / 2) { px -= 2; g.font = `${style}${weight} ${px}px ${face}`; }
    let out = String(s);
    while (out.length > 1 && g.measureText(out).width > COL) out = `${out.slice(0, -2)}…`;
    g.fillStyle = color;
    g.fillText(out, ax, y);
  };

  // brand, always at the top left (at the column's top on a right-hand layout)
  const bx = layout === 'right' ? ax : 88;
  // the brand is just its name; the anime skin alone has the mascot beside it
  if (skin.emoji) drawMascot(g, bx + 44, 116, 44, 'happy');
  const wx = skin.emoji ? bx + 108 : bx;
  g.textAlign = 'left';
  g.font = `800 46px ${SANS}`;
  g.fillStyle = ink;
  g.letterSpacing = '1px';
  g.fillText('TRUE VISION', wx, 120);
  g.font = `600 19px ${SANS}`;
  g.fillStyle = soft;
  g.letterSpacing = '9px';
  g.fillText('JOURNAL', wx + 2, 154);
  g.letterSpacing = '0px';

  const top = center ? 18 : 0; // the centred layout sits a little lower, under the brand
  fit(words.title, 284 + top, 800, 84, ink);
  text(words.titleSub, 328 + top, `700 30px ${face}`, ink, '1px');
  // the account, in a pill
  g.font = `600 23px ${face}`;
  let pill = data.pill || `${words.funded} · ${data.account || ''}`;
  while (pill.length > 4 && g.measureText(pill).width > Math.min(COL, 600) - 48) pill = `${pill.slice(0, -2)}…`;
  const pw = g.measureText(pill).width + 46;
  const px0 = center ? ax - pw / 2 : ax;
  g.save();
  g.shadowColor = 'transparent';
  g.beginPath();
  g.roundRect(px0, 360 + top, pw, 48, 24);
  g.fillStyle = light ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.38)';
  g.fill();
  g.strokeStyle = alpha(skin.accent, 0.75);
  g.lineWidth = 2;
  g.stroke();
  g.restore();
  g.textAlign = 'left';
  g.fillStyle = skin.accent;
  g.fillText(pill, px0 + 23, 392 + top);
  // the theme's line; a long one breaks in two (at its comma when it has one) rather than shrinking to nothing
  if (skin.motto) {
    g.font = `italic 600 26px ${face}`;
    if (g.measureText(skin.motto).width <= COL) fit(skin.motto, 462 + top, 600, 26, skin.accent, 'italic ');
    else {
      const parts = skin.motto.split(' ');
      const comma = skin.motto.indexOf(', ');
      const cut = comma > 0 ? skin.motto.slice(0, comma + 1).split(' ').length : Math.ceil(parts.length / 2);
      fit(parts.slice(0, cut).join(' '), 450 + top, 600, 24, skin.accent, 'italic ');
      fit(parts.slice(cut).join(' '), 482 + top, 600, 24, skin.accent, 'italic ');
    }
  }
  // to whom, and how much
  text(words.honor, 538 + top, `600 27px ${face}`, soft, '1px');
  if (words.honorSub) text(words.honorSub, 566 + top, `500 17px ${face}`, faint, '1px');
  fit(data.name || 'Trader', 640 + top, 800, 62, ink);
  text(words.amount, 712 + top, `600 27px ${face}`, soft, '1px');
  if (words.amountSub) text(words.amountSub, 740 + top, `500 17px ${face}`, faint, '1px');
  fit(money(Number(data.amount) || 0), 838 + top, 800, 96, skin.accent);
  text(`${words.paid} ${data.date || ''}${data.id ? `   ·   No. TV-${String(data.id).slice(-6).toUpperCase()}` : ''}`, 882 + top, `500 20px ${face}`, faint, '1px');
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;

  // signed by the CEO; the mascot, dressed for the theme, beside the signature (on the left when the signature
  // sits at the right), and an award seal when the theme has one
  if (center) {
    drawCertSignature(g, W - 88 - 300, H - 104, skin.sig, ink, faint);
    if (skin.emoji) drawMascot(g, 150, H - 130, 62, skin.mood);
  } else {
    drawCertSignature(g, ax, H - 104, skin.sig, ink, faint);
    if (skin.emoji) drawMascot(g, ax + 420 + (skin.sig ? 26 : 0), H - 118, 62, skin.mood);
  }
  if (skin.autograph) drawAutograph(g, layout === 'right' ? 300 : W - 300, H - 250, skin.autograph, '#FFFFFF');
  if (skin.seal) drawSeal(g, center ? W - 170 : layout === 'left' ? W - 190 : 190, center ? 200 : H - 270, 80, skin.seal, skin.accent);

  g.restore();
}

// Milestones of the total payout: a certificate opens for each once the payouts received add up to it.
const PAYOUT_MILESTONES = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
const shortMoney = (n) => (n >= 1000000 ? `$${n / 1000000}M` : n >= 1000 ? `$${n / 1000}K` : `$${n}`);
/** The payouts received, added up in date order: { total, count, last, reached: { <milestone>: { date, total, count } } }. */
function payoutMilestones(payouts) {
  const list = [...(payouts || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let total = 0, count = 0;
  const reached = {};
  for (const p of list) {
    total += payoutReceived(p);
    count++;
    for (const m of PAYOUT_MILESTONES) if (!reached[m] && total >= m) reached[m] = { date: p.date, total, count };
  }
  return { total, count, last: list.length ? list[list.length - 1].date : '', reached };
}

/** The certificate skins as a locker: a thumbnail, the name, its rarity, and the rank that opens it. */
function renderCertSkins(parent, plugin, rank, selected, onPick) {
  const open = new Set(unlockedCertSkins(rank).map((k) => k.key));
  const head = parent.createDiv({ cls: 'tvj-card-head' });
  head.createDiv({ cls: 'tvj-card-title', text: 'Certificate skins' });
  head.createDiv({ cls: 'tvj-muted', text: `${open.size} of ${CERT_SKINS.length} unlocked · three open with each rank` });
  const upload = CERT_SKINS.find((k) => k.upload);
  if (upload) {
    const tools = parent.createDiv({ cls: 'tvj-options tvj-cert-upload' });
    tools.createEl('button', { text: CERT_ART[upload.key] ? 'Change your picture' : 'Upload your picture' }).addEventListener('click', () => pickCertPicture(plugin, () => onPick(upload.key)));
  }
  const grid = parent.createDiv({ cls: 'tvj-cert-skins' });
  const sample = { name: plugin.settings.profileName || 'Trader', account: 'Funded', amount: 5000, date: isoDay(new Date()) };
  for (const skin of CERT_SKINS) {
    const unlocked = open.has(skin.key);
    const rarity = RARITIES[certRarity(skin)];
    const item = grid.createEl('button', { cls: `tvj-cert-skin ${unlocked ? '' : 'is-locked'} ${skin.key === selected ? 'is-active' : ''}` });
    const thumb = item.createDiv({ cls: 'tvj-cert-skin-thumb' });
    const c = thumb.createEl('canvas');
    c.width = 300;
    c.height = 215;
    drawCertificate(c, sample, skin.key);
    if (!unlocked) thumb.createDiv({ cls: 'tvj-cert-skin-lock', text: '🔒' });
    const words = item.createDiv({ cls: 'tvj-cert-skin-text' });
    words.createDiv({ cls: 'tvj-cert-skin-name', text: skin.name.toUpperCase() });
    words.createDiv({ cls: 'tvj-cert-skin-rarity', text: rarity.label }).style.color = rarity.color;
    const needsPicture = skin.upload && !CERT_ART[skin.key];
    item.createDiv({ cls: 'tvj-cert-skin-tag', text: !unlocked ? `RANK · ${skin.tier.toUpperCase()}` : needsPicture ? 'UPLOAD' : skin.key === selected ? 'IN USE' : 'USE' });
    if (!unlocked) { item.disabled = true; continue; }
    item.addEventListener('click', () => (needsPicture ? pickCertPicture(plugin, () => onPick(skin.key)) : onPick(skin.key)));
  }
}

/** Opens the file picker for the "Your Picture" skin; `done()` runs once the picture is in. */
function pickCertPicture(plugin, done) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.addEventListener('change', async () => {
    if (input.files && input.files[0] && await plugin.setCertPicture(input.files[0])) done();
  });
  input.click();
}

/** The certificate of one payout: the picture, Copy and Save, and the skins to dress it in. */
class CertificateModal extends ThemedModal {
  constructor(app, plugin, payout) {
    super(app);
    this.plugin = plugin;
    this.payout = payout;
    this.skin = plugin.settings.certSkin || 'classic';
  }
  onOpen() {
    this.modalEl.addClass('tvj-flex-modal', 'tvj-cert-modal');
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    const p = this.payout;
    accentTitle(contentEl, 'h2', p.heading || 'Payout certificate');
    contentEl.createEl('p', { cls: 'tvj-muted', text: `${money(payoutReceived(p))} · ${p.account} · ${p.date}` });
    const rank = this.plugin.ownRank();
    if (!unlockedCertSkins(rank).some((k) => k.key === this.skin)) this.skin = 'classic';
    const canvas = contentEl.createEl('canvas', { cls: 'tvj-cert-canvas' });
    canvas.width = CERT_W;
    canvas.height = CERT_H;
    const settings = this.plugin.settings;
    const draw = () => drawCertificate(canvas, { name: settings.profileName || 'Trader', account: p.account, amount: payoutReceived(p), date: p.date, id: p.id, titleSub: p.titleSub, pill: p.pill, motto: settings.certMotto, font: settings.certFont }, this.skin);
    draw();
    // your own line above PROUDLY AWARDED TO, and the type the words are set in; both stay for every certificate
    const own = contentEl.createDiv({ cls: 'tvj-options tvj-cert-own' });
    const skin = CERT_SKINS.find((k) => k.key === this.skin) || CERT_SKINS[0];
    const line = own.createEl('input', { type: 'text', cls: 'tvj-cert-motto', attr: { placeholder: skin.motto || 'Your line, e.g. Look. At. This. Payout.', maxlength: '90', 'aria-label': 'Your line' } });
    line.value = settings.certMotto || '';
    line.addEventListener('input', () => { settings.certMotto = line.value; draw(); });
    line.addEventListener('change', () => this.plugin.saveData(settings));
    const font = own.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Font' } });
    for (const [key, label] of CERT_FONT_CHOICES) font.createEl('option', { text: label, value: key });
    font.value = CERT_FONTS[settings.certFont] ? settings.certFont : '';
    font.addEventListener('change', async () => { settings.certFont = font.value; draw(); await this.plugin.saveData(settings); });
    const actions = contentEl.createDiv({ cls: 'tvj-options' });
    actions.createEl('button', { text: 'Copy image', cls: 'mod-cta' }).addEventListener('click', () => copyCanvas(canvas, 'Certificate copied to the clipboard.'));
    actions.createEl('button', { text: 'Save to certificates' }).addEventListener('click', async () => {
      const file = await this.plugin.saveCertificate(canvas, p);
      if (file) notify(`Saved: ${file.path}`);
    });
    renderCertSkins(contentEl.createDiv({ cls: 'tvj-cert-skin-box' }), this.plugin, rank, this.skin, async (key) => {
      this.skin = key;
      this.plugin.settings.certSkin = key;
      await this.plugin.saveData(this.plugin.settings);
      this.render();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
}


