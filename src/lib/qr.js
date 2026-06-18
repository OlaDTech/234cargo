// Minimal but correct QR Code encoder (byte mode, ECC level M).
// Returns a 2D boolean matrix. Supports versions 1-10 (enough for shipping marks/URLs).
// Adapted to be dependency-free for use inside a React artifact.

const EC_LEVEL = 0; // M
// Galois field tables
const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
function gfMul(a, b) { if (a === 0 || b === 0) return 0; return GF_EXP[GF_LOG[a] + GF_LOG[b]]; }

// Version capacities (byte mode, level M) for versions 1..10
const BYTE_CAP_M = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
// EC codewords per block + block structure (level M) for versions 1..10
// [totalCodewords, ecPerBlock, [ [numBlocks, dataPerBlock], ... ] ]
const VERSION_INFO = {
  1: { total: 26, ec: 10, groups: [[1, 16]] },
  2: { total: 44, ec: 16, groups: [[1, 28]] },
  3: { total: 70, ec: 26, groups: [[1, 44]] },
  4: { total: 100, ec: 18, groups: [[2, 32]] },
  5: { total: 134, ec: 24, groups: [[2, 43]] },
  6: { total: 172, ec: 16, groups: [[4, 27]] },
  7: { total: 196, ec: 18, groups: [[4, 31]] },
  8: { total: 242, ec: 22, groups: [[2, 38], [2, 39]] },
  9: { total: 292, ec: 22, groups: [[3, 36], [2, 37]] },
  10: { total: 346, ec: 26, groups: [[4, 43], [1, 44]] },
};

function pickVersion(len) {
  for (let v = 1; v <= 10; v++) if (len <= BYTE_CAP_M[v]) return v;
  return 10;
}

function genECPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function ecForBlock(data, ecLen) {
  const gen = genECPoly(ecLen);
  const res = data.concat(new Array(ecLen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
  }
  return res.slice(data.length);
}

function encodeData(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else { bytes.push(0x3f); } // replace non-ASCII with '?'
  }
  const version = pickVersion(bytes.length);
  const info = VERSION_INFO[version];
  const totalDataCodewords = info.groups.reduce((s, [n, d]) => s + n * d, 0);

  // bit buffer
  let bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4); // byte mode
  // char count indicator: 8 bits for v1-9, 16 for v10+
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach(b => push(b, 8));
  // terminator
  const cap = totalDataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  // pad bytes
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (bits.length < cap) { push(padBytes[pi % 2], 8); pi++; }

  // to codewords
  const dataCW = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataCW.push(b);
  }

  // split into blocks
  const blocks = [];
  let idx = 0;
  info.groups.forEach(([n, d]) => {
    for (let i = 0; i < n; i++) { blocks.push(dataCW.slice(idx, idx + d)); idx += d; }
  });
  const ecBlocks = blocks.map(b => ecForBlock(b, info.ec));

  // interleave
  const maxData = Math.max(...blocks.map(b => b.length));
  const result = [];
  for (let i = 0; i < maxData; i++) blocks.forEach(b => { if (i < b.length) result.push(b[i]); });
  for (let i = 0; i < info.ec; i++) ecBlocks.forEach(b => result.push(b[i]));

  return { version, codewords: result };
}

// Build the matrix
function buildMatrix(text) {
  const { version, codewords } = encodeData(text);
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  function placeFinder(r, c) {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      const rr = r + i, cc = c + j;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      const inRing = i >= 0 && i <= 6 && j >= 0 && j <= 6;
      const isDark = inRing && ((i === 0 || i === 6 || j === 0 || j === 6) || (i >= 2 && i <= 4 && j >= 2 && j <= 4));
      m[rr][cc] = inRing ? (isDark ? 1 : 0) : 0;
      reserved[rr][cc] = true;
    }
  }
  placeFinder(0, 0); placeFinder(0, size - 7); placeFinder(size - 7, 0);

  // timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (m[6][i] === null) { m[6][i] = i % 2 === 0 ? 1 : 0; reserved[6][i] = true; }
    if (m[i][6] === null) { m[i][6] = i % 2 === 0 ? 1 : 0; reserved[i][6] = true; }
  }
  // alignment pattern (versions >= 2): single one near bottom-right
  const alignPos = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  if (version >= 2) {
    const pos = alignPos[version];
    for (const r of pos) for (const c of pos) {
      // skip if overlaps finder
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const isDark = Math.max(Math.abs(i), Math.abs(j)) !== 1;
        m[r + i][c + j] = isDark ? 1 : 0; reserved[r + i][c + j] = true;
      }
    }
  }
  // dark module
  m[size - 8][8] = 1; reserved[size - 8][8] = true;
  // reserve format info areas
  for (let i = 0; i < 9; i++) { if (!reserved[8][i]) reserved[8][i] = true; if (!reserved[i][8]) reserved[i][8] = true; }
  for (let i = 0; i < 8; i++) { reserved[8][size - 1 - i] = true; reserved[size - 1 - i][8] = true; }

  // place data with mask 0
  const maskFn = (r, c) => (r + c) % 2 === 0;
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  const getBit = () => { const b = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1; bitIdx++; return b; };
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip timing column
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        let bit = bitIdx < totalBits ? getBit() : 0;
        if (maskFn(row, cc)) bit ^= 1;
        m[row][cc] = bit;
      }
    }
    upward = !upward;
  }

  // format info (level M = 0b00, mask 0 = 0b000) → 15 bits with BCH
  const formatBits = computeFormat(0b00, 0b000);
  // place format info
  for (let i = 0; i <= 5; i++) m[8][i] = formatBits[i];
  m[8][7] = formatBits[6]; m[8][8] = formatBits[7]; m[7][8] = formatBits[8];
  for (let i = 9; i < 15; i++) m[14 - i][8] = formatBits[i];
  for (let i = 0; i < 8; i++) m[size - 1 - i][8] = formatBits[i];
  for (let i = 8; i < 15; i++) m[8][size - 15 + i] = formatBits[i];

  return m.map(row => row.map(v => v === 1));
}

function computeFormat(ecLevel, mask) {
  const data = (ecLevel << 3) | mask;
  let bits = data << 10;
  const g = 0b10100110111;
  for (let i = 14; i >= 10; i--) if ((bits >> i) & 1) bits ^= g << (i - 10);
  let format = ((data << 10) | bits) ^ 0b101010000010010;
  const out = [];
  for (let i = 14; i >= 0; i--) out.push((format >> i) & 1);
  return out;
}

export function generateQR(text) {
  try { return buildMatrix(text); } catch (e) { return null; }
}
