// Gera PNGs simples para icon, splash e adaptive-icon do Trippin
const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
    const t = [];
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const tb = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])));
    return Buffer.concat([len, tb, data, crcBuf]);
}

function makePNG(w, h, bg, drawFn) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 2;

    // Build raw RGBA rows
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
        const row = y * (w * 3 + 1);
        raw[row] = 0;
        for (let x = 0; x < w; x++) {
            const color = drawFn ? drawFn(x, y, w, h) : bg;
            raw[row + 1 + x * 3]     = color[0];
            raw[row + 1 + x * 3 + 1] = color[1];
            raw[row + 1 + x * 3 + 2] = color[2];
        }
    }
    const comp = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', comp), chunk('IEND', Buffer.alloc(0))]);
}

// Cores Trippin
const DARK  = [20, 33, 61];   // #14213D
const CORAL = [255, 107, 92]; // #FF6B5C
const WHITE = [255, 255, 255];

// Ícone 1024×1024: fundo escuro + círculo coral central
function iconDraw(x, y, w, h) {
    const cx = w / 2, cy = h / 2, r = w * 0.38;
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < r * r) return CORAL;
    return DARK;
}

// Splash 1284×2778: fundo escuro + faixa coral no centro
function splashDraw(x, y, w, h) {
    const band = Math.abs(y - h / 2) < h * 0.05;
    return band ? CORAL : DARK;
}

fs.writeFileSync('assets/icon.png',          makePNG(1024, 1024, DARK, iconDraw));
fs.writeFileSync('assets/adaptive-icon.png', makePNG(1024, 1024, DARK, iconDraw));
fs.writeFileSync('assets/splash.png',        makePNG(1284, 2778, DARK, splashDraw));
fs.writeFileSync('assets/favicon.png',       makePNG(48,   48,   DARK, iconDraw));

console.log('Assets gerados: icon.png, adaptive-icon.png, splash.png, favicon.png');
