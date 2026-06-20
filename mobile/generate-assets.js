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

// Silhueta de avião (apontando para cima) em espaço 0..100, centrada em x=50.
// União de 3 polígonos: fuselagem, asas (enflechadas) e empenagem.
const PLANE = [
    [[50, 16], [54, 26], [53, 70], [50, 80], [47, 70], [46, 26]], // fuselagem
    [[50, 40], [86, 62], [50, 54], [14, 62]],                     // asas
    [[50, 66], [66, 80], [50, 75], [34, 80]],                     // cauda
];
function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi))
            inside = !inside;
    }
    return inside;
}
function planeHit(px, py) { return PLANE.some(poly => pointInPoly(px, py, poly)); }

// Ícone 1024×1024: fundo escuro + disco coral + avião branco (identifica o app na tela)
function iconDraw(x, y, w, h) {
    const s = w / 100, px = x / s, py = y / s;
    if (planeHit(px, py)) return WHITE;
    const dx = px - 50, dy = py - 50;
    if (dx * dx + dy * dy < 42 * 42) return CORAL;
    return DARK;
}

// Splash: fundo escuro + avião coral centralizado
function splashDraw(x, y, w, h) {
    const size = w * 0.34, ox = w / 2 - size / 2, oy = h / 2 - size / 2;
    const px = (x - ox) / size * 100, py = (y - oy) / size * 100;
    if (px >= 0 && px <= 100 && py >= 0 && py <= 100 && planeHit(px, py)) return CORAL;
    return DARK;
}

fs.writeFileSync('assets/icon.png',          makePNG(1024, 1024, DARK, iconDraw));
fs.writeFileSync('assets/adaptive-icon.png', makePNG(1024, 1024, DARK, iconDraw));
fs.writeFileSync('assets/splash.png',        makePNG(1284, 2778, DARK, splashDraw));
fs.writeFileSync('assets/favicon.png',       makePNG(48,   48,   DARK, iconDraw));

console.log('Assets gerados: icon.png, adaptive-icon.png, splash.png, favicon.png');
