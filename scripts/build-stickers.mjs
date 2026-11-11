// 貼圖 icon 管線：Microsoft Fluent Emoji（MIT），從 npm 的 @iconify-json/fluent-emoji 取 SVG，
// 依分類挑約 300 個常用的，輸出到 public/stickers/*.svg ＋ 目錄 src/stickers/catalog.generated.json ＋ 授權檔。
// 一般改程式不用重跑（成品已 commit）。重跑：npm run stickers
// 下載的東西放 .font-cache/stickers/（不進 git）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CACHE = '.font-cache/stickers';
const COLOR = { pkg: '@iconify-json/fluent-emoji', ver: '1.2.7' };
const FLAT = { pkg: '@iconify-json/fluent-emoji-flat', ver: '1.2.6' }; // 只用它的 metadata.json（分類）
const OUT = 'public/stickers';

fs.mkdirSync(CACHE, { recursive: true });
function unpack({ pkg, ver }) {
  const dir = path.join(CACHE, `${pkg.replace('@', '').replace('/', '-')}-${ver}`);
  if (!fs.existsSync(path.join(dir, 'package', 'icons.json'))) {
    const tgz = execFileSync('npm', ['pack', `${pkg}@${ver}`, '--pack-destination', CACHE], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .pop();
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('tar', ['-xzf', path.join(CACHE, tgz), '-C', dir]);
  }
  return path.join(dir, 'package');
}
const colorDir = unpack(COLOR);
const flatDir = unpack(FLAT);
const icons = JSON.parse(fs.readFileSync(path.join(colorDir, 'icons.json'), 'utf8'));
const info = JSON.parse(fs.readFileSync(path.join(colorDir, 'info.json'), 'utf8'));
if (info.license?.spdx !== 'MIT' || !/Microsoft/.test(info.author?.name ?? ''))
  throw new Error(
    `授權不是預期的 MIT / Microsoft：${JSON.stringify(info.license)} ${JSON.stringify(info.author)}`,
  );
const cats = JSON.parse(fs.readFileSync(path.join(flatDir, 'metadata.json'), 'utf8')).categories;

const SKIN = /-(light|medium-light|medium|medium-dark|dark)$/;
// 依分類挑：先用人工挑的常用清單（照順序），不存在的跳過；不足 min 個時用該分類其他的補
const w = (t) => t.trim().split(/\s+/);
const PLAN = [
  {
    name: '表情',
    from: 'Smileys & Emotion',
    min: 50,
    pick: w(
      `grinning-face grinning-face-with-big-eyes grinning-face-with-smiling-eyes beaming-face-with-smiling-eyes grinning-squinting-face face-with-tears-of-joy rolling-on-the-floor-laughing smiling-face-with-smiling-eyes smiling-face-with-halo slightly-smiling-face upside-down-face winking-face smiling-face-with-heart-eyes smiling-face-with-hearts star-struck face-blowing-a-kiss kissing-face face-savoring-food face-with-tongue winking-face-with-tongue zany-face squinting-face-with-tongue money-mouth-face hugging-face face-with-hand-over-mouth shushing-face thinking-face zipper-mouth-face face-with-raised-eyebrow neutral-face expressionless-face smirking-face unamused-face face-with-rolling-eyes grimacing-face relieved-face pensive-face sleepy-face drooling-face sleeping-face face-with-medical-mask hot-face cold-face woozy-face dizzy-face exploding-head partying-face smiling-face-with-sunglasses nerd-face confused-face worried-face astonished-face flushed-face pleading-face crying-face loudly-crying-face face-screaming-in-fear angry-face pouting-face smiling-face-with-tear melting-face saluting-face face-holding-back-tears skull ghost alien-monster robot pile-of-poo grinning-cat smiling-cat-with-heart-eyes see-no-evil-monkey hear-no-evil-monkey speak-no-evil-monkey`,
    ),
  },
  {
    name: '愛心',
    from: 'Smileys & Emotion',
    min: 20,
    pick: w(
      `red-heart orange-heart yellow-heart green-heart blue-heart purple-heart pink-heart light-blue-heart black-heart white-heart brown-heart grey-heart broken-heart two-hearts revolving-hearts beating-heart growing-heart sparkling-heart heart-with-arrow heart-with-ribbon heart-decoration heart-exclamation heart-on-fire mending-heart kiss-mark love-letter hundred-points collision dizzy sparkles speech-balloon thought-balloon anger-symbol zzz`,
    ),
  },
  {
    name: '手勢',
    from: 'People & Body',
    min: 20,
    pick: w(
      `thumbs-up thumbs-down ok-hand victory-hand crossed-fingers love-you-gesture sign-of-the-horns call-me-hand waving-hand raised-hand clapping-hands raising-hands folded-hands handshake heart-hands palms-up-together open-hands flexed-biceps writing-hand backhand-index-pointing-left backhand-index-pointing-right backhand-index-pointing-up backhand-index-pointing-down index-pointing-up index-pointing-at-the-viewer pinched-fingers pinching-hand oncoming-fist raised-fist hand-with-index-finger-and-thumb-crossed`,
    ),
  },
  {
    name: '動物植物',
    from: 'Animals & Nature',
    min: 40,
    pick: w(
      `dog-face cat-face mouse-face hamster rabbit-face fox bear panda koala tiger-face lion cow-face pig-face frog monkey-face chicken penguin bird baby-chick hatching-chick duck owl unicorn bee butterfly lady-beetle snail turtle snake dolphin spouting-whale tropical-fish octopus shark sloth otter hedgehog paw-prints cherry-blossom rose sunflower tulip hibiscus bouquet four-leaf-clover herb seedling cactus palm-tree maple-leaf fallen-leaf mushroom evergreen-tree deciduous-tree blossom`,
    ),
  },
  {
    name: '食物',
    from: 'Food & Drink',
    min: 40,
    pick: w(
      `red-apple green-apple strawberry cherries peach watermelon grapes banana lemon tangerine pineapple mango avocado kiwi-fruit blueberries coconut hamburger french-fries pizza hot-dog sandwich taco sushi bento-box steaming-bowl spaghetti cooked-rice rice-ball dumpling fried-shrimp croissant bread pancakes waffle egg cooking poultry-leg shortcake birthday-cake cupcake doughnut cookie chocolate-bar candy lollipop custard soft-ice-cream ice-cream shaved-ice honey-pot hot-beverage teacup-without-handle bubble-tea cup-with-straw tropical-drink cocktail-glass wine-glass beer-mug clinking-beer-mugs bottle-with-popping-cork glass-of-milk`,
    ),
  },
  {
    name: '慶祝活動',
    from: 'Activities',
    min: 25,
    pick: w(
      `party-popper confetti-ball balloon wrapped-gift christmas-tree jack-o-lantern fireworks sparkler ribbon trophy sports-medal 1st-place-medal soccer-ball basketball tennis video-game artist-palette performing-arts ticket admission-tickets tanabata-tree pine-decoration magic-wand crystal-ball game-die kite teddy-bear puzzle-piece yarn framed-picture`,
    ),
  },
  {
    name: '旅行天氣',
    from: 'Travel & Places',
    min: 25,
    pick: w(
      `sun sun-with-face sun-behind-cloud sun-behind-small-cloud cloud cloud-with-rain cloud-with-lightning cloud-with-snow snowflake snowman rainbow umbrella-with-rain-drops high-voltage fire droplet water-wave crescent-moon full-moon-face star glowing-star shooting-star milky-way globe-showing-asia-australia airplane bus automobile bicycle house house-with-garden beach-with-umbrella camping ferris-wheel roller-coaster mount-fuji cityscape-at-dusk sunset night-with-stars rocket ship`,
    ),
  },
  {
    name: '物品',
    from: 'Objects',
    min: 25,
    pick: w(
      `camera camera-with-flash video-camera movie-camera film-frames clapper-board mobile-phone laptop headphone musical-note musical-notes microphone light-bulb books open-book memo pencil scissors gem-stone crown ring lipstick sunglasses dress t-shirt high-heeled-shoe handbag shopping-bags money-bag envelope-with-arrow round-pushpin calendar alarm-clock hourglass-done magnifying-glass-tilted-left key locked bell megaphone loudspeaker`,
    ),
  },
  {
    name: '符號',
    from: 'Symbols',
    min: 25,
    pick: w(
      `check-mark-button check-mark cross-mark red-question-mark red-exclamation-mark double-exclamation-mark exclamation-question-mark warning prohibited no-entry sparkle eight-pointed-star new-button free-button up-button cool-button top-arrow soon-arrow red-circle orange-circle yellow-circle green-circle blue-circle purple-circle recycling-symbol peace-symbol infinity plus minus multiply right-arrow left-arrow up-arrow down-arrow play-button pause-button record-button repeat-button`,
    ),
  },
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const used = new Set();
const catalog = [];
let bytes = 0;
for (const p of PLAN) {
  const missing = p.pick.filter((s) => !icons.icons[s]);
  if (missing.length) console.warn(`（${p.name}）找不到：${missing.join(' ')}`);
  const names = p.pick.filter((s) => icons.icons[s] && !used.has(s));
  for (const s of cats[p.from] ?? []) {
    if (names.length >= p.min) break;
    if (!SKIN.test(s) && icons.icons[s] && !used.has(s) && !names.includes(s)) names.push(s);
  }
  for (const s of names) {
    used.add(s);
    const ic = icons.icons[s];
    const w = ic.width ?? icons.width ?? 32;
    const h = ic.height ?? icons.height ?? 32;
    // 寬高給 512：<img> 的原始大小夠大，畫進畫布時才清楚
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="512" height="${Math.round((512 * h) / w)}">${ic.body}</svg>\n`;
    fs.writeFileSync(path.join(OUT, `${s}.svg`), svg);
    bytes += svg.length;
  }
  names.forEach((s) => used.add(s));
  catalog.push({ name: p.name, items: names });
}
fs.writeFileSync(
  path.join(OUT, 'LICENSE.txt'),
  `貼圖 icon：Microsoft Fluent Emoji（${COLOR.pkg}@${COLOR.ver}，原始專案 https://github.com/microsoft/fluentui-emoji）\n授權：MIT（見下方全文）。本網站只收錄其中 ${used.size} 個，未修改圖形，只加上 width/height 屬性。\n\n` +
    fs.readFileSync(path.join(CACHE, 'LICENSE'), 'utf8'),
);
fs.writeFileSync(
  'src/stickers/catalog.generated.json',
  JSON.stringify(
    {
      source: `${COLOR.pkg}@${COLOR.ver}`,
      license: 'MIT',
      author: 'Microsoft Corporation',
      categories: catalog,
    },
    null,
    1,
  ) + '\n',
);
console.log(
  `貼圖 ${used.size} 個，${(bytes / 1024 / 1024).toFixed(2)} MB；分類：${catalog.map((c) => `${c.name} ${c.items.length}`).join('、')}`,
);
