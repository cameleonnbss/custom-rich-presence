// Generates assets/icon.png — a deliberately simple placeholder so a real
// icon can be dropped in later (see README: "Icône personnalisée").
// Pure Node, no dependencies: writes a hand-encoded PNG.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 512;

// RGBA pixel buffer
const px = Buffer.alloc(SIZE * SIZE * 4, 0);

function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Panel: dark slate rounded square
// Glyph: three horizontal "presence" bars of decreasing width (monochrome)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    if (!insideRoundedRect(x, y, 16, 16, SIZE - 17, SIZE - 17, 96)) continue;
    px[i] = 0x1c; px[i + 1] = 0x20; px[i + 2] = 0x26; px[i + 3] = 0xff; // #1C2026
    const bars = [
      { y0: 176, y1: 216, x1: 336 },
      { y0: 248, y1: 288, x1: 256 },
      { y0: 320, y1: 360, x1: 336 }
    ];
    for (const b of bars) {
      if (y >= b.y0 && y <= b.y1 && x >= 96 && x <= b.x1) {
        px[i] = 0xe8; px[i + 1] = 0xea; px[i + 2] = 0xed; px[i + 3] = 0xff; // #E8EAED
      }
    }
  }
}

// Encode PNG (color type 6, RGBA, one IDAT)
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, body, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);

mkdirSync("assets", { recursive: true });
writeFileSync("assets/icon.png", png);
console.log("assets/icon.png écrit (" + SIZE + "×" + SIZE + ")");
