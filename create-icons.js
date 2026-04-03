/**
 * PWAアイコン生成スクリプト
 * 外部依存なし（Node.js built-in のみ）
 * 使い方: node create-icons.js
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// CRC32
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = (crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeB = Buffer.from(type, 'ascii');
  const lenB = Buffer.allocUnsafe(4);
  lenB.writeUInt32BE(data.length, 0);
  const crcB = Buffer.allocUnsafe(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])), 0);
  return Buffer.concat([lenB, typeB, data, crcB]);
}

function createPNG(size) {
  const pixels = new Uint8Array(size * size * 3);

  // 背景: #0f0e17 (ダークネイビー)
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3]     = 15;
    pixels[i * 3 + 1] = 14;
    pixels[i * 3 + 2] = 23;
  }

  const s = size / 192;

  // ビル群: ゴールド #f5a623
  const buildings = [
    // [x, y_top, width]  ※下端はsize
    [10,  110, 32],
    [48,   85, 28],
    [82,   55, 38],
    [126,  95, 30],
    [162,  70, 20],
  ];

  for (const [bx, by, bw] of buildings) {
    const x0 = Math.round(bx * s);
    const x1 = Math.round((bx + bw) * s);
    const y0 = Math.round(by * s);
    for (let y = y0; y < size; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * size + x) * 3;
        pixels[idx]     = 245; // R
        pixels[idx + 1] = 166; // G
        pixels[idx + 2] = 35;  // B
      }
    }
    // 窓: 暗い矩形
    const winW = Math.max(1, Math.round(6 * s));
    const winH = Math.max(1, Math.round(6 * s));
    const winGapX = Math.max(2, Math.round(9 * s));
    const winGapY = Math.max(2, Math.round(12 * s));
    for (let wy = y0 + Math.round(10 * s); wy + winH < size; wy += winGapY) {
      for (let wx = x0 + Math.round(6 * s); wx + winW < x1 - Math.round(3 * s); wx += winGapX) {
        for (let dy = 0; dy < winH; dy++) {
          for (let dx = 0; dx < winW; dx++) {
            const idx = ((wy + dy) * size + (wx + dx)) * 3;
            pixels[idx]     = 15;
            pixels[idx + 1] = 14;
            pixels[idx + 2] = 40;
          }
        }
      }
    }
  }

  // 月: #ffffd0 (右上)
  const moonX = Math.round(160 * s);
  const moonY = Math.round(20 * s);
  const moonR = Math.round(14 * s);
  for (let y = moonY - moonR; y <= moonY + moonR; y++) {
    for (let x = moonX - moonR; x <= moonX + moonR; x++) {
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const dx = x - moonX, dy = y - moonY;
      if (dx * dx + dy * dy <= moonR * moonR) {
        const idx = (y * size + x) * 3;
        pixels[idx]     = 255;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = 208;
      }
    }
  }

  // PNG エンコード
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.allocUnsafe(1 + size * 3);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 3;
      row[1 + x * 3]     = pixels[src];
      row[1 + x * 3 + 1] = pixels[src + 1];
      row[1 + x * 3 + 2] = pixels[src + 2];
    }
    rows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createPNG(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), createPNG(512));
console.log('アイコン生成完了: icons/icon-192.png, icons/icon-512.png');
