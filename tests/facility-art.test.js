'use strict';
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CARDS } = require('./helpers/runtime-loaders').loadGameRuntime();
const UiBuildMenu = require('../js/uiBuildMenu');
const { runTest } = require('./helpers/test-utils');
const sprite = fs.readFileSync(path.join(__dirname, '../icons/facility-art.svg'), 'utf8');
const titleArt = fs.readFileSync(path.join(__dirname, '../icons/sunset-city.svg'), 'utf8');
const brandMark = fs.readFileSync(path.join(__dirname, '../icons/dice-city-mark.svg'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
const generator = path.join(__dirname, '../scripts/create-facility-art.py');
runTest('街とサイコロのブランドマークをタイトルとPWAメタデータで共有する', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
    assert.match(brandMark, /viewBox="0 0 128 128"/);
    assert.match(brandMark, /width="128" height="128"/);
    assert.match(brandMark, /rotate\(11\)/, 'a readable die anchors the mark');
    assert.match(html, /class="title-brand-mark" src="icons\/dice-city-mark\.svg"/);
    assert.match(html, /rel="icon" type="image\/svg\+xml" href="\/icons\/dice-city-mark\.svg"/);
    assert.match(html, /property="og:image" content="\/icons\/icon-512\.png"/);
    assert.ok(manifest.icons.some(icon => icon.src === '/icons/dice-city-mark.svg' && icon.type === 'image/svg+xml'));
});
function render(card) {
    return UiBuildMenu.renderBuildCardButton({ card, stock: 6, canBuildThis: true, escapeHtml: value => String(value), getEffectText: () => '' });
}
runTest('全施設の図版参照は同梱されたSVG symbolへ解決する', () => {
    const motifs = new Set();
    assert.strictEqual(CARDS.length, 38, 'the complete facility set should be reviewed');
    for (const card of CARDS) {
        const match = render(card).match(/facility-art\.svg#([a-z-]+)/);
        assert.ok(match, card.name);
        assert.ok(sprite.includes(`id="${match[1]}"`), card.name);
        motifs.add(match[1]);
    }
    assert.strictEqual(motifs.size, CARDS.length, 'each facility should have its own illustration');
});
runTest('市場カードは施設の業種に合った景色を持ち、カード色の意味は上帯に保つ', () => {
    const cardMarkup = name => render(CARDS.find(card => card.name === name));
    assert.ok(cardMarkup('麦畑').includes('facility-scene-pasture'));
    assert.ok(cardMarkup('サンマ漁船').includes('facility-scene-water'));
    assert.ok(cardMarkup('寿司屋').includes('facility-scene-street'));
    assert.ok(cardMarkup('食品倉庫').includes('facility-scene-industrial'));
    assert.ok(cardMarkup('ビジネスセンター').includes('facility-scene-civic'));
    assert.ok(cardMarkup('税務署').includes('card-color-purple'));
    assert.ok(styles.includes('.card-btn .facility-scene-water'));
    assert.ok(styles.includes('.card-btn .facility-scene-street'));
    assert.ok(styles.includes('.card-btn .facility-scene-industrial'));
    assert.ok(styles.includes('.card-btn .facility-scene-civic'));
    assert.ok(styles.includes('.card-btn .facility-scene-landmark'));
    const sceneRule = name => styles.match(new RegExp(`\\.card-btn \\.facility-scene-${name} \\{([\\s\\S]*?)\\n\\}`, 'm'))?.[1] || '';
    const waterScene = sceneRule('water');
    const streetScene = sceneRule('street');
    const industrialScene = sceneRule('industrial');
    const civicScene = sceneRule('civic');
    assert.match(waterScene, /circle at 22% 24%/, 'water scene places its sunset reflection on the opposite shore');
    assert.match(streetScene, /ellipse at 76% 18%/, 'street scene uses a broad warm glow instead of a repeated sun disc');
    assert.doesNotMatch(streetScene, /radial-gradient\(circle/);
    assert.match(industrialScene, /ellipse at 24% 16%/, 'industrial scene uses reflected haze rather than the same sun disc');
    assert.doesNotMatch(industrialScene, /radial-gradient\(circle/);
    assert.match(civicScene, /circle at 21% 24%/, 'civic scene balances the light source on the opposite side');
});
runTest('海産カードは帆船ではなく漁具と水揚げで船の仕事を描き分ける', () => {
    const fishery = sprite.match(/<symbol id="fishery"[\s\S]*?<\/symbol>/)?.[0] || '';
    const tunaBoat = sprite.match(/<symbol id="tuna-boat"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(fishery.includes('M103 34Q115 35 128 43L121 53Q112 48 105 47Z'), 'coastal fishing boat has a visible net');
    assert.ok(fishery.includes('M111 52Q117 47 124 50L130 47L128 53L123 57Q116 58 111 52Z'), 'coastal fishing boat shows its catch');
    assert.ok(!fishery.includes('M83 26V8L116 26Z'), 'coastal fishing boat no longer reads as a sailboat');
    assert.ok(tunaBoat.includes('M42 48V22L25 12M48 47V18L36 8M116 47V16L137 10'), 'tuna longliner has raised fishing poles');
    assert.ok(tunaBoat.includes('M116 40Q124 31 135 34L149 29L145 38L138 44Q126 47 116 40Z'), 'tuna longliner carries a larger tuna');
});
runTest('森林の段枝シルエットは鉱山の稜線と形で区別できる', () => {
    const forest = sprite.match(/<symbol id="forest"[\s\S]*?<\/symbol>/)?.[0] || '';
    const mine = sprite.match(/<symbol id="mine"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(forest.includes('M80 3L70 19H75L62 32H68L55 47H74V53H86V47H105'));
    assert.ok(forest.includes('stroke="#b7c595"'));
    assert.ok(!forest.includes('M13 64Q80 43 147 64V73H13Z'), 'trees grow into the ground, not on a display plinth');
    assert.ok(forest.includes('M0 60Q25 52 54 59T109 58Q138 53 160 61V80H0Z'), 'several tree heights stand on a natural hillside');
    assert.ok(forest.includes('M-4 79Q28 66 61 73T126 72Q146 68 164 77'), 'undulating forest-floor rows add foreground depth');
    assert.ok(mine.includes('M13 67L55 12L78 41L106 6L147 67'));
    assert.ok(mine.includes('M18 64L55 17L74 40L62 37L50 48L40 45L31 57Z'), 'faceted rock planes give the mine cliff a worked stone texture');
    assert.ok(mine.includes('M116 54V36L130 27L144 36V54'), 'a timber hoist marks an active mine entrance');
});
runTest('麦畑とコーン畑は穂先の光と雄花・畝で農園内の作物差を見せる', () => {
    const field = sprite.match(/<symbol id="field"[\s\S]*?<\/symbol>/)?.[0] || '';
    const corn = sprite.match(/<symbol id="corn"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(field.includes('stroke="#fff0bd"'), 'wheat catches warm light at the grain heads');
    assert.ok(!field.includes('M15 58Q80 35 145 58L139 73H21Z'), 'wheat grows in a continuous landscape, not a raised planter');
    assert.ok(field.includes('M0 59Q31 48 64 57T128 56Q147 52 160 59V80H0Z'), 'wheat rows continue into a layered field');
    assert.ok(field.includes('M-5 79Q29 64 61 72T122 71Q142 66 166 76'), 'curved furrows add depth beneath the crops');
    assert.ok(corn.includes('M78 11Q73 3 69 5M78 11Q80 3 84 3'), 'corn stalks have recognizable tassels');
    assert.ok(!corn.includes('M14 64Q80 42 146 63V73H14Z'), 'corn grows in continuous ground, not a raised planter');
    assert.ok(corn.includes('M0 60Q33 49 69 58T132 57Q148 54 160 60V80H0Z'), 'corn shares the rolling farmland language');
    assert.ok(corn.includes('M-4 79Q29 66 61 73T121 72Q143 68 164 77'), 'corn field has layered furrows');
});
runTest('建物カードは業種を示す売場・構造の細部を維持する', () => {
    const art = name => sprite.match(new RegExp(`<symbol id="${name}"[\\s\\S]*?<\\/symbol>`))?.[0] || '';
    assert.ok(art('shop').includes('M49 54H62M49 57H73M97 52H111'));
    assert.ok(art('bakery').includes('M26 31L80 7L134 31Z'), 'bakery has a high, warm gable that separates it from flat shopfronts');
    assert.ok(art('bakery').includes('M67 25Q67 15 80 15Q93 15 93 25V28H67Z'), 'a scored loaf forms the gable sign');
    assert.ok(art('bakery').includes('M49 60Q49 54 56 53Q63 54 63 60V62H49'), 'display windows show baked goods on their shelves');
    assert.ok(art('convenience').includes('M8 24Q8 22 10 22H25Q27 22 27 24V43H8Z'), 'convenience store has its own tall corner pylon sign');
    assert.ok(art('convenience').includes('M17.5 29.4V31.5L19.2 32.5'), 'the sign carries a lit clock to signal late-night service');
    assert.ok(art('convenience').includes('<rect x="43" y="50" width="4" height="3"'));
    assert.ok(art('cheese').includes('circle cx="47" cy="57" r="4"'), 'cheese factory windows show aging wheels');
    assert.ok(art('cheese').includes('M40 62H57M72 57H87M105 62H122'), 'cheese wheels sit on interior curing shelves');
    assert.ok(art('general-store').includes('M22 32L80 8L138 32V38H22Z'));
    assert.ok(art('general-store').includes('M67 31H93V38H67Z'));
    assert.ok(art('general-store').includes('M33 61H48V67H33Z'));
    assert.ok(art('florist').includes('M28 61H48L46 69H30Z'));
    assert.ok((art('florist').match(/cx="122" cy="47"/g) || []).length === 1);
    assert.ok(art('pizzeria').includes('M59 61L72 53M61 61H79'));
    assert.ok(art('pizzeria').includes('M91 66V57Q91 49 101.5 49Q112 49 112 57V66Z'), 'pizzeria shows an arched oven');
    assert.ok(art('pizzeria').includes('M118 14H127V29H118Z'), 'oven chimney rises beyond the right roof edge');
    assert.ok(art('pizzeria').includes('M121 11Q118 7 122 4M126 10Q129 7 126 3'), 'warm oven smoke curls above the chimney');
    assert.ok(art('family').includes('M31 45H65V60H31ZM95 45H129V60H95Z'));
    assert.ok(art('family').includes('M70 66V49Q70 45 74 45H86Q90 45 90 49V66Z'));
    assert.ok(art('family').includes('M24 62H136M27 64H133'));
    assert.ok(art('sushi').includes('M49 40H68V52Q58.5 55 49 52Z'));
    assert.ok(art('sushi').includes('M21 39H30V51Q25.5 55 21 51Z'), 'sushi shop has a distinct hanging lantern');
    assert.ok(art('sushi').includes('M55 60Q59 56 63 60Z'), 'sushi shop shows plated nigiri outside its noren');
    assert.ok(art('stadium').includes('M17 37V14M143 37V14'), 'stadium has paired floodlight towers');
    assert.ok(art('stadium').includes('M46 52V44H54V52M106 52V44H114V52'), 'the pitch has opposing goals');
    assert.ok(art('tv-station').includes('M80 22V5M68 8H92'), 'TV station has a rooftop broadcast mast');
    assert.ok(art('tv-station').includes('M77 57Q78 52 83 52Q88 52 89 57Z'), 'the studio window shows an on-air presenter');
    assert.ok(art('members-bar').includes('M65 40H95V66H65Z'), 'members bar has a private double-door entrance');
    assert.ok(art('members-bar').includes('M40 60Q80 66 120 60'), 'velvet rope marks the reserved entrance');
    assert.ok(art('startup').includes('M18 58V18Q18 14 23 14H137Q142 14 142 18V58Z'), 'IT venture is a workspace scene, not a floating monitor icon');
    assert.ok(art('startup').includes('M28 44V34H36V44M39 44V27H47V44'), 'office windows show a dusk city skyline');
    assert.ok(art('startup').includes('width="56" height="34" rx="3"'), 'rounded desktop screen frames the software dashboard');
    assert.ok(art('startup').includes('M70 42L76 39L82 41L91 34L99 36'), 'dashboard shows a rising product-usage graph');
    assert.ok(art('startup').includes('M26 55H134L140 59H20Z'), 'shared desk, keyboard, plant, cup, and chair complete the office scene');
    assert.ok(art('business-center').includes('M85 6L109 17V66H85Z'), 'business center tower has a distinct shaded glass side');
    assert.ok(art('business-center').includes('M76 65V54Q85 48 94 54V65Z'), 'the tower has an illuminated lobby entrance');
    assert.ok(art('business-center').includes('M77 66H93L105 73H65Z'), 'a paved approach connects the office campus to the street');
    assert.ok(art('business-center').includes('M17 54Q17 49 22 49Q25 45 29 49'), 'small planted trees complete the office forecourt');
    assert.ok(art('factory').includes('M110 15H120'));
    assert.ok(art('furniture').includes('M22 66V31L50 15H89L105 26L137 12V66Z'));
    assert.ok(art('furniture').includes('M95 54V45Q95 42 98 42H103'));
    assert.ok(art('warehouse').includes('M43 47V63M53 47V63'));
    assert.ok(art('warehouse').includes('M38 28H55V38H38Z'));
    assert.ok(art('warehouse').includes('M105 29H122V38H105Z'));
    assert.ok(art('warehouse').includes('M46.5 28V38M38 33H55'), 'warehouse cartons have clear tape seams');
    assert.ok(art('winery').includes('M40 53Q40 50 49 49Q58 50 58 53L56 65Q49 68 42 65Z'));
    assert.ok(art('winery').includes('M41 54H57M42 61H56M103 54H119M104 61H118'), 'winery casks have metal hoops');
    assert.ok(art('winery').includes('M60 66V48Q60 33 80 31Q100 33 100 48V66Z'), 'winery has an arched cellar entrance instead of a shop awning');
    assert.ok(art('winery').includes('circle cx="81" cy="28" r="2.2"'), 'grapes above the cellar entrance identify wine production');
});
runTest('貸金業は円の紋章・分割窓・奥まった入口で金融施設と読める', () => {
    const lender = sprite.match(/<symbol id="lender"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(lender.includes('circle cx="80" cy="35" r="7.2"'), 'yen medallion anchors the pediment');
    assert.ok(lender.includes('M43 43Q43 40 46 40H59Q62 40 62 43V56H43Z'), 'left divided window frames a lit interior');
    assert.ok(lender.includes('M69 46H91V64H69Z'), 'recessed double entry distinguishes the frontage');
    assert.ok(lender.includes('M32 64H128L134 68H26Z'), 'broad stone steps ground the institutional facade');
});
runTest('ショッピングモールは多層の広い外観と中央入口で一般店舗から区別できる', () => {
    const mall = sprite.match(/<symbol id="mall"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(mall.includes('M29 35V20L44 8H116L131 20V35Z'), 'upper floor gives the mall a multi-story silhouette');
    assert.ok(mall.includes('M36 23H124V33H36Z'), 'upper floor has a continuous glass facade');
    assert.ok(mall.includes('M68 46H92V66H68Z'), 'central entrance reads as a large public entry');
});
runTest('喫茶店とレストランは看板・屋根・窓構成で別の建物として読める', () => {
    const art = name => sprite.match(new RegExp(`<symbol id="${name}"[\\s\\S]*?<\\/symbol>`))?.[0] || '';
    assert.ok(art('cafe').includes('circle cx="80" cy="19" r="9"'), 'cafe has a dedicated coffee sign');
    assert.ok(art('cafe').includes('Q114 47 110 42'), 'cafe has a scalloped canopy');
    assert.ok(art('cafe').includes('M20 65V57H29'), 'cafe has sidewalk seating');
    assert.ok(art('bistro').includes('M25 31L37 11H123L135 31'), 'bistro has a mansard roof');
    assert.ok(art('bistro').includes('M38 36H68V58H38Z'), 'bistro has tall paired windows');
    assert.ok(art('bistro').includes('M70 66V51Q70 43 80 43Q90 43 90 51V66Z'), 'bistro has an arched entrance');
    assert.ok(art('bistro').includes('M45 50H61M101 50H113M53 50V54M107 50V54'), 'bistro windows show a warmly lit dining room with tables');
    assert.ok(art('bistro').includes('M47 43Q44 43 46 46H48Q50 43 47 43Z'), 'bistro dining tables have visible wine glasses');
});
runTest('青果市場は一般店舗と異なる開放型の果物スタンドとして読める', () => {
    const produce = sprite.match(/<symbol id="produce"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(produce.includes('M34 34V64M126 34V64'), 'open stall is held up by exposed posts');
    assert.ok(produce.includes('M29 33H131V39Q128 44 124 39'), 'striped canopy has an open scalloped valance');
    assert.ok(produce.includes('M33 48H72V63H33ZM88 48H127V63H88Z'), 'produce is grouped in market crates');
    assert.ok(produce.includes('circle cx="42" cy="49" r="4.6"'), 'fruit is clearly visible on the counters');
    assert.ok(!produce.includes('M24 65V31H136V65Z'), 'the art no longer uses a closed generic storefront');
});
runTest('タイトルの街景は遠景・陰影・生活の灯りで市場カードより豊かな主役図版にする', () => {
    assert.ok(titleArt.includes('M0 121V104L11 98L22 104V121'), 'distant neighborhood silhouette');
    assert.ok(titleArt.includes('M113 92L124 99V142H113Z'), 'house side plane');
    assert.ok(titleArt.includes('M171 127H189V136H171Z'), 'lit storefront display');
    assert.ok(titleArt.includes('M132 148V124H138V148Z'), 'foreground street detail');
});
runTest('牧場は台座でなく地続きの牧草地に家畜と柵を置き、牛の特徴も保つ', () => {
    const ranch = sprite.match(/<symbol id="ranch"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(!ranch.includes('M15 62Q79 43 145 61V73H15Z'), 'ranch scene has no beveled display plinth');
    assert.ok(ranch.includes('M0 62Q25 55 53 62T108 61Q137 55 160 62V80H0Z'), 'pasture ground flows beyond the scene edges');
    assert.ok(ranch.includes('M0 72Q28 65 59 71T123 70Q145 66 160 72V80H0Z'), 'a second meadow layer adds depth');
    assert.ok(ranch.includes('M1 78Q30 70 61 75T124 74Q146 69 160 75'), 'pasture has a soft grass-row highlight');
    assert.ok(ranch.includes('M124 42Q121 38 123 36Q127 38 127 42'));
    assert.ok(ranch.includes('circle cx="128.5" cy="45.5" r="1.2"'));
    assert.ok(ranch.includes('M104 55Q109 52 114 55V59H104Z'));
});
runTest('リンゴ園は枝の分かれ方と果実の光で丸い樹冠の列から果樹園へ読める', () => {
    const orchard = sprite.match(/<symbol id="orchard"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(orchard.includes('M47 49L39 39M47 44L55 33'));
    assert.ok(orchard.includes('M31 32Q29 24 38 19Q40 11 48 14Q56 10 61 19'), 'irregular overlapping crowns read as orchard trees');
    assert.ok(!orchard.includes('<circle cx="47" cy="31" r="17"'), 'tree crowns are not simple lollipop circles');
    assert.ok(orchard.includes('M0 61Q28 53 56 60T111 59Q140 53 160 61V80H0Z'), 'trees stand on continuous orchard ground');
    assert.ok(orchard.includes('M-4 79Q30 66 64 73T126 71Q145 68 164 77'), 'ground rows create depth below the trees');
    assert.ok(orchard.includes('M35 25Q39 16 47 16'), 'canopies catch a restrained highlight');
    assert.strictEqual((orchard.match(/r="1"/g) || []).length, 6, 'every apple gets a light catch');
});
runTest('ブドウ園は棚葉の葉脈と房の反射で粒の塊から果実へ読める', () => {
    const vineyard = sprite.match(/<symbol id="vineyard"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(!vineyard.includes('M14 64Q80 43 146 64V73H14Z'), 'trellises grow from continuous vineyard ground');
    assert.ok(vineyard.includes('M0 61Q27 53 58 60T117 59Q141 54 160 61V80H0Z'), 'ground follows the vineyard slope');
    assert.ok(vineyard.includes('M-4 79Q27 67 61 73T126 72Q146 68 164 77'), 'parallel ground rows add depth below the trellis');
    assert.ok(vineyard.includes('M35 24L43 21M56 24L65 21'));
    assert.strictEqual((vineyard.match(/fill="#f0d3ed" opacity="\.9"><circle/g) || []).length, 1);
    assert.strictEqual((vineyard.match(/r="1\.[12]"/g) || []).length, 9, 'grape highlights stay restrained');
});
runTest('花畑は地続きの畝と花弁・中心部で植木箱や丸い看板に見えない', () => {
    const flower = sprite.match(/<symbol id="flower"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(!flower.includes('M14 63Q79 42 146 63V73H14Z'), 'flower field has no raised planter lip');
    assert.ok(flower.includes('M0 61Q26 52 54 60T109 59Q138 54 160 61V80H0Z'), 'flowers stand in continuous landscape');
    assert.ok(flower.includes('M-4 79Q28 66 62 73T125 72Q145 68 164 77'), 'field rows continue below the flower stems');
    assert.strictEqual((flower.match(/<g transform="translate\((?:35 34|63 24|91 33|120 27)\)">/g) || []).length, 4);
    assert.strictEqual((flower.match(/<ellipse cy="-5" rx="[23](?:\.\d)?" ry="[34](?:\.\d)?"/g) || []).length, 4);
    assert.strictEqual((flower.match(/<circle cx="(?:35|63|91|120)" cy="(?:34|24|33|27)" r="2\.\d"/g) || []).length, 4);
});
runTest('公園は家型の建物ではなく開放的な東屋・園路・ベンチで公共空間と分かる', () => {
    const park = sprite.match(/<symbol id="park-ground"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(park.includes('M57 35Q63 23 80 19Q97 23 103 35L96 39'));
    assert.ok(park.includes('M62 39V55M72 37V55M88 37V55M98 39V55'));
    assert.ok(park.includes('M37 65Q80 48 124 65'));
    assert.ok(park.includes('M29 53H49V57H29Z'));
    assert.ok(park.includes('M58 80Q63 69 75 62Q89 54 84 42'), 'winding stone path leads into the pavilion');
    assert.ok(park.includes('M20 51Q17 46 22 42'), 'tree crowns have varied leafy silhouettes, not repeated circles');
    assert.ok(park.includes('M137 64V43M133 44H141L139 39H135Z'), 'a lit path lamp makes the park feel occupied after sunset');
    assert.strictEqual((park.match(/circle cx="(?:18|21|15|109|112|106)" cy=/g) || []).length, 6, 'flower beds add small warm foreground details');
});
runTest('フラワーショップの窓は棚と店内の花束で花の販売店と分かる', () => {
    const florist = sprite.match(/<symbol id="florist"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(florist.includes('M49 63H74M92 63H111'));
    assert.ok(florist.includes('M53 62V57M61 62V55M69 62V57M96 62V55M104 62V56M110 62V57'));
    assert.ok(florist.includes('M50 57Q53 53 56 57Q53 60 50 57Z'));
});
runTest('出版社は本のサインと窓越しの印刷機・紙束で一般店舗から見分けられる', () => {
    const publisher = sprite.match(/<symbol id="publisher"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(publisher.includes('M69 21V15Q75 13 80 17Q85 13 91 15V21Q85 19 80 23Q75 19 69 21Z'));
    assert.ok(publisher.includes('M80 17V22M73 17H77M83 17H87'));
    assert.ok(publisher.includes('cx="53" cy="45" r="3.1"'), '窓の中に印刷ローラーを描く');
    assert.ok(publisher.includes('M97 39L115 39L119 44L101 44Z'), '印刷された紙が排出される');
    assert.ok(publisher.includes('M101 56H118M104 58H116'), '窓辺に仕上がった紙束を描く');
});
runTest('引越し屋の荷台は大きさの違う梱包箱と封かんテープで引越し作業を描く', () => {
    const mover = sprite.match(/<symbol id="mover"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(mover.includes('M28 40H91V61H28Z'), 'the truck cargo bay has a defined interior');
    assert.ok(mover.includes('M32 48L40 44L48 48V60H32Z'));
    assert.ok(mover.includes('M51 45L58 41L65 45V60H51Z'));
    assert.ok(mover.includes('M68 48L76 44L84 48V60H68Z'));
    assert.ok(mover.includes('M40 44V49M58 41V47M76 44V49'), 'packing tape closes the boxes');
});
runTest('税務署は公的な正面構造と印付きの申告書で事務所系施設から見分けられる', () => {
    const taxOffice = sprite.match(/<symbol id="tax-office"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(taxOffice.includes('M61 7H99V24H61Z'));
    assert.ok(taxOffice.includes('M61 42V62M99 42V62'), 'the entrance is framed by civic columns');
    assert.ok(taxOffice.includes('M89 12V20M86.5 14H91M86.5 18H91'), 'the form carries a distinct official seal');
});
runTest('改装屋は足場・筋交い・塗料缶で工事中の建物と分かる', () => {
    const remodel = sprite.match(/<symbol id="remodel"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(remodel.includes('M114 67V27M143 67V27M110 30H147M110 44H147M110 58H147'));
    assert.ok(remodel.includes('M114 30L143 44M143 30L114 44M114 44L143 58M143 44L114 58'));
    assert.ok(remodel.includes('M118 57H135L133 67H120Z'));
    assert.ok(remodel.includes('M119 22H136V26H119Z'));
});
runTest('ドリンク工場は色違いの瓶詰めラインと搬送ベルトで飲料製造が読める', () => {
    const beverage = sprite.match(/<symbol id="beverage"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(beverage.includes('M41 52Q41 50 45 50Q49 50 49 52V59Q49 62 45 62Q41 62 41 59Z'), 'a lit window shows fermentation vats');
    assert.ok(beverage.includes('M45 50V47H55V49M55 49V46H59V44'), 'pipework connects the brewing equipment');
    assert.ok(beverage.includes('M72 59H95L92 63H74Z'), 'the interior bottling line has a moving conveyor');
    assert.ok(beverage.includes('M75 54V52H77V54L79 56V59H73V56Z'), 'bottles move through the illuminated production window');
    assert.ok(beverage.includes('M94 64H124L128 67H96Z'), 'filled bottles continue onto a loading belt');
    assert.ok(beverage.includes('M109 8Q105 5 109 2M118 8Q122 5 119 2'), 'soft stack vapor gives the plant a lived-in scene');
});
runTest('駅のランドマーク図案は建物にホームと線路を加えて駅と分かる', () => {
    const station = sprite.match(/<symbol id="station"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(station.includes('M22 67H138'));
    assert.ok(station.includes('M4 64V59Q4 53 11 53H40Q48 53 50 61V66H4Z'), 'a local train sits at the platform in front of the station');
    assert.ok(station.includes('M8 58Q9 55 13 55H26V60H8Z') && station.includes('M30 55H40Q44 56 45 60H30Z'), 'the train has separate lit windows');
    assert.ok(station.includes('M7 62H47'), 'a warm belt marks the train side');
    assert.ok(station.includes('M19 71H141M19 77H141'));
    assert.ok(station.includes('M27 69V79M39 69V79'));
});
runTest('空港のランドマークはターミナル窓・入口・滑走路標識で着陸場面まで描く', () => {
    const airport = sprite.match(/<symbol id="airport"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(airport.includes('M42 51V59M55 51V59M68 51V59M81 51V59M94 51V59M107 51V59'));
    assert.ok(airport.includes('M68 59H82V68H68Z'), 'the terminal has a distinct passenger entrance');
    assert.ok(airport.includes('M49 79H111L92 68H68Z'), 'a foreshortened runway leads from the terminal');
    assert.ok(airport.includes('M77 77L78 74H82L83 77M78.5 72H81.5'), 'runway center markings stay legible');
    assert.strictEqual((airport.match(/<circle cx="(?:56|63|104|97)" cy="(?:76|74)" r="1\.[35]"/g) || []).length, 4);
});
runTest('電波塔の足元に送信盤・信号灯を描き、塔だけの記号から放送施設へ仕上げる', () => {
    const radio = sprite.match(/<symbol id="radio"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(radio.includes('M32 70V59H56V70Z'), 'left power cabinet is present');
    assert.ok(radio.includes('M35 62H53V67H35Z'), 'equipment display has a framed service panel');
    assert.ok(radio.includes('M104 70V61H128V70Z'), 'right receiver cabinet balances the tower base');
    assert.ok(radio.includes('cx="120" cy="58" r="2"'), 'a red aviation marker light is visible');
    assert.ok(radio.includes('M56 65Q62 61 68 63M92 63Q98 61 104 65'), 'ground cables lead into the transmitter');
});
runTest('遊園地は観覧車の電飾と入口のチケット小屋で施設の場面を描く', () => {
    const park = sprite.match(/<symbol id="park"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(park.includes('M18 68V54L31 46L44 54V68Z'), 'ticket booth stands beside the ride');
    assert.ok(park.includes('M22 59H40V64H22Z'), 'the booth has a service window');
    assert.ok(park.includes('cx="31" cy="50" r="2.2"'), 'ticket mark is visible above the window');
    assert.strictEqual((park.match(/<circle cx="(?:80|98|106|62|54)" cy="(?:7|14|33|52)" r="1.5"/g) || []).length, 7);
});
runTest('sunset市場カードは施設本体を読みやすく拡大し街ミニチュアの縮尺に触れない', () => {
    assert.match(styles, /html\[data-design="sunset"\] \.card-btn \.sunset-facility-art > use\s*\{[^}]*transform-box:\s*view-box;[^}]*scale\(1\.08\)/);
    assert.doesNotMatch(styles, /\.town-building \.sunset-facility-art > use\s*\{[^}]*scale\(1\.08\)/);
});
runTest('街ミニチュアは建物の後ろに控えめな地形を敷いても図版と路肩線を前面に保つ', () => {
    assert.match(styles, /html\[data-design="sunset"\] \.town-street::before\s*\{[^}]*radial-gradient\(ellipse 52% 82%/);
    assert.match(styles, /html\[data-design="sunset"\] \.town-building,\s*html\[data-design="sunset"\] \.town-overflow\s*\{[^}]*z-index:\s*1/);
    assert.match(styles, /@media \(min-width: 361px\) and \(max-width: 480px\)\s*\{\s*html\[data-design="sunset"\] \.town-street\s*\{ grid-template-columns: repeat\(auto-fit, 80px\); \}/, 'common phone width gives town illustrations room to read');
});
runTest('清掃業の図案は建物だけでなく清掃用具が主題として認識できる', () => {
    const cleaning = sprite.match(/<symbol id="cleaning"[\s\S]*?<\/symbol>/)?.[0] || '';
    assert.ok(cleaning.includes('M76 55H91L89 67H78Z'));
    assert.ok(cleaning.includes('M63 56L76 42M63 56L56 64M63 56L61 66'));
    assert.ok(cleaning.includes('M110 42L99 55M99 55L94 64M99 55L99 66'));
    assert.ok(cleaning.includes('circle cx="95" cy="48"'));
});
runTest('SVG図案の線は意図しない既定の黒塗りにならず、色調gradient参照が解決する', () => {
    const gradients = new Set([...sprite.matchAll(/<linearGradient id="([^"]+)"/g)].map(match => match[1]));
    const symbols = [...sprite.matchAll(/<symbol id="[^"]+"[^>]*>([\s\S]*?)<\/symbol>/g)];
    assert.strictEqual(symbols.length, 50);
    for (const symbol of symbols) {
        const inheritedFills = [];
        for (const match of symbol[1].matchAll(/<g\b[^>]*>|<\/g>|<path\b[^>]*\/>/g)) {
            const tag = match[0];
            if (tag.startsWith('<g')) {
                const ownFill = tag.match(/\bfill="([^"]+)"/);
                inheritedFills.push(ownFill ? ownFill[1] : (inheritedFills.at(-1) || ''));
                continue;
            }
            if (tag === '</g>') {
                inheritedFills.pop();
                continue;
            }
            for (const reference of tag.matchAll(/url\(#([^)]*)\)/g)) {
                assert.ok(gradients.has(reference[1]), `unresolved SVG gradient: ${reference[1]}`);
            }
            const pathData = tag.match(/\bd="([^"]+)"/)?.[1] || '';
            if (!/\bfill=/.test(tag) && !inheritedFills.at(-1) && !/\bZ\s*$/i.test(pathData)) {
                assert.match(tag, /\bfill="none"/, `open stroked path needs explicit no-fill: ${pathData}`);
            }
        }
    }
});
runTest('農園と工場の図版は商店へ誤分類されず、未知の名前も安全に分類する', () => {
    const corn = CARDS.find(card => card.name === 'コーン畑');
    assert.ok(render(corn).includes('facility-art.svg#corn'));
    assert.ok(render({ ...corn, name: 'constructor' }).includes('facility-art.svg#field'));
    assert.ok(render(CARDS.find(card => card.name === '麦畑')).includes('facility-art.svg#field'));
    assert.ok(render(CARDS.find(card => card.name === '花畑')).includes('facility-art.svg#flower'));
    assert.ok(render(CARDS.find(card => card.name === 'ブドウ園')).includes('facility-art.svg#vineyard'));
    assert.ok(render(CARDS.find(card => card.name === 'リンゴ園')).includes('facility-art.svg#orchard'));
    const cheese = CARDS.find(card => card.name === 'チーズ工場');
    assert.ok(render(cheese).includes('facility-art.svg#cheese'));
});

runTest('街の施設数は建設と取消に追従し、無効なランドマークを数えない', () => {
    const wheat = CARDS.find(card => card.name === '麦畑');
    const player = { cards: [wheat], landmarks: { '駅': true, '港': true, '空港': false } };
    const enabled = new Set(['駅', '空港']);
    const original = UiBuildMenu.renderTownHtml(player, enabled);
    assert.ok(original.includes('施設 1枚 · ランドマーク 1個'));
    player.cards.push(wheat);
    const built = UiBuildMenu.renderTownHtml(player, enabled);
    assert.ok(built.includes('施設 2枚 · ランドマーク 1個'));
    assert.ok(built.includes('×2'));
    assert.strictEqual((built.match(/facility-art.svg#field/g) || []).length, 1);
    player.cards.pop();
    assert.strictEqual(UiBuildMenu.renderTownHtml(player, enabled), original);
});

runTest('街の省略表示でも施設総数を保持し、施設名をHTMLへ埋め込まない', () => {
    const cards = Array.from({ length: 10 }, (_, i) => ({ name: `<img src=x onerror=alert(${i})>`, category: '農園' }));
    const html = UiBuildMenu.renderTownHtml({ cards, landmarks: {} });
    assert.ok(html.includes('施設 10枚'));
    assert.ok(html.includes('ほか2種'));
    assert.strictEqual((html.match(/facility-art.svg#field/g) || []).length, 8);
    assert.ok(!html.includes('onerror'));
});

runTest('6ランドマークは種類別の同梱図版を持ち、未知の名前は安全な図版へ戻る', () => {
    const { Player } = require('./helpers/runtime-loaders').loadGameRuntime();
    const references = new Set();
    for (const name of Player.landmarkNames()) {
        const html = UiBuildMenu.renderLandmarkBuildButton({
            name, built: false, cost: Player.landmarkCost(name), canBuildThis: false,
            escapeHtml: value => String(value), getLandmarkEffectText: () => '', getLandmarkEmoji: () => '',
        });
        const motif = html.match(/facility-art\.svg#([a-z]+)/)[1];
        assert.ok(sprite.includes(`id="${motif}"`), name);
        references.add(motif);
    }
    assert.strictEqual(references.size, Player.landmarkNames().length);
    const fallback = UiBuildMenu.renderTownHtml({ cards: [], landmarks: { constructor: true } }, new Set(['constructor']));
    assert.ok(fallback.includes('facility-art.svg#landmark'));
});

runTest('旧図案ジェネレーターは下書きだけを書き本番の施設アートを保護する', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'machikoro-facility-art-'));
    const draftPath = path.join(tempDir, 'draft.svg');
    const productionPath = path.join(__dirname, '../icons/facility-art.svg');
    const before = fs.readFileSync(productionPath);
    try {
        execFileSync('python3', [generator, '--output', draftPath], { stdio: 'pipe' });
        assert.ok(fs.readFileSync(draftPath, 'utf8').includes('<symbol id="field"'));
        assert.throws(
            () => execFileSync('python3', [generator, '--output', productionPath], { stdio: 'pipe' }),
            error => error.status !== 0 && String(error.stderr).includes('refusing to overwrite curated production artwork')
        );
        assert.deepStrictEqual(fs.readFileSync(productionPath), before);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

runTest('sunsetのランドマーク市場アイコンはemojiでなく対応するvector図版を使う', () => {
    const html = UiBuildMenu.renderLandmarkBuildButton({
        name: '駅', built: false, cost: 4, canBuildThis: true,
        escapeHtml: value => String(value), getLandmarkEffectText: () => '',
        getLandmarkEmoji: () => '🚉',
        renderLandmarkMark: UiBuildMenu.renderLandmarkBadgeIcon,
    });
    assert.ok(html.includes('<span class="card-landmark-mark"><svg class="landmark-badge-icon"'));
    assert.ok(html.includes('facility-art.svg#station'));
    assert.ok(!html.includes('>🚉</span>'));
});

runTest('街の夕暮れ用ランドマークバッジは街並みと同じ固有図版を使う', () => {
    const { Player } = require('./helpers/runtime-loaders').loadGameRuntime();
    const motifs = new Set();
    for (const name of Player.landmarkNames()) {
        const html = UiBuildMenu.renderLandmarkBadgeIcon(name);
        const motif = html.match(/facility-art\.svg#([a-z-]+)/)?.[1];
        assert.ok(motif, name);
        assert.ok(sprite.includes(`<symbol id="${motif}"`), name);
        motifs.add(motif);
    }
    assert.strictEqual(motifs.size, Player.landmarkNames().length);
    assert.ok(UiBuildMenu.renderLandmarkBadgeIcon('constructor').includes('facility-art.svg#landmark'));
    assert.ok(UiBuildMenu.renderCoinMark().includes('class="card-coin-mark"'));
});
