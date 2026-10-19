// Générateur de codes QR de Bio Star Monde Éden : mode octet (UTF-8), correction d'erreurs M, versions 1 à 10.
// Suffit pour une adresse de traçabilité (jusqu'à 213 octets). Aucune dépendance.
// Usage : BSMEQR.toSvg('https://…', { title: 'Code QR du lot' }) renvoie un élément <svg>.
(function (global) {
  'use strict';

  // Niveau M : mots de correction par bloc et nombre de blocs, pour les versions 1 à 10 (indice 0 inutilisé).
  const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  const MAX_VERSION = 10;

  function rawModules(ver) {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      result -= (25 * n - 10) * n - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

  // Corps de Galois GF(256), polynôme 0x11D.
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    const result = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
    }
    return result;
  }

  function encodeData(bytes) {
    let ver = 1;
    for (; ver <= MAX_VERSION; ver++) {
      if (4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver) * 8) break;
    }
    if (ver > MAX_VERSION) throw new Error('Texte trop long pour le code QR.');
    const bits = [];
    const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    push(0b0100, 4); // mode octet
    push(bytes.length, ver <= 9 ? 8 : 16);
    for (const b of bytes) push(b, 8);
    const capacity = dataCodewords(ver) * 8;
    push(0, Math.min(4, capacity - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
    const words = [];
    for (let i = 0; i < bits.length; i += 8) {
      let w = 0;
      for (let j = 0; j < 8; j++) w = (w << 1) | bits[i + j];
      words.push(w);
    }
    return { ver, words };
  }

  function addEccAndInterleave(ver, data) {
    const numBlocks = NUM_BLOCKS[ver];
    const eccLen = ECC_PER_BLOCK[ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const numShort = numBlocks - (raw % numBlocks);
    const shortLen = Math.floor(raw / numBlocks);
    const divisor = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, divisor);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const result = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => { if (i !== shortLen - eccLen || j >= numShort) result.push(block[i]); });
    }
    return result;
  }

  function alignmentPositions(ver, size) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < n; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  }

  function buildMatrix(ver, codewords, mask) {
    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { modules[y][x] = dark; isFunction[y][x] = true; };

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
        }
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const pos = alignmentPositions(ver, size);
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }

    // Informations de format (niveau M = 00) et de version.
    const formatData = (0 << 3) | mask;
    let rem = formatData;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const format = ((formatData << 10) | rem) ^ 0x5412;
    const fbit = (i) => ((format >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, fbit(i));
    set(8, 7, fbit(6)); set(8, 8, fbit(7)); set(7, 8, fbit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, fbit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, fbit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, fbit(i));
    set(8, size - 8, true);
    if (ver >= 7) {
      let vrem = ver;
      for (let i = 0; i < 12; i++) vrem = (vrem << 1) ^ ((vrem >>> 11) * 0x1f25);
      const vbits = (ver << 12) | vrem;
      for (let i = 0; i < 18; i++) {
        const dark = ((vbits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        set(a, b, dark); set(b, a, dark);
      }
    }

    // Données, en zigzag, de droite à gauche par colonnes de deux.
    let bit = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && bit < codewords.length * 8) {
            modules[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
            bit++;
          }
        }
      }
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (!isFunction[y][x] && maskBit(mask, x, y)) modules[y][x] = !modules[y][x];
    }
    return modules;
  }

  // Pénalités de la norme : suites de 5 modules ou plus, blocs 2×2, motifs proches des repères, équilibre clair/foncé.
  const FINDER_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const FINDER_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  function penalty(m) {
    const size = m.length;
    let score = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        const cell = (b) => (b < 0 || b >= size ? false : pass === 0 ? m[a][b] : m[b][a]);
        let color = cell(0);
        let run = 1;
        for (let b = 1; b < size; b++) {
          if (cell(b) === color) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score++;
          } else { color = cell(b); run = 1; }
        }
        for (let b = -4; b < size; b++) {
          let matchA = true;
          let matchB = true;
          for (let k = 0; k < 11; k++) {
            const v = cell(b + k) ? 1 : 0;
            if (v !== FINDER_A[k]) matchA = false;
            if (v !== FINDER_B[k]) matchB = false;
          }
          if (matchA) score += 40;
          if (matchB) score += 40;
        }
      }
    }
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (m[y][x]) dark++;
        if (y < size - 1 && x < size - 1) {
          const c = m[y][x];
          if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
        }
      }
    }
    const total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    const { ver, words } = encodeData(bytes);
    const codewords = addEccAndInterleave(ver, words);
    let best = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const m = buildMatrix(ver, codewords, mask);
      const s = penalty(m);
      if (s < bestScore) { bestScore = s; best = m; }
    }
    return { version: ver, size: best.length, modules: best };
  }

  function toSvg(text, options = {}) {
    const margin = options.margin ?? 4;
    const qr = encode(text);
    const n = qr.size + margin * 2;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img');
    if (options.title) svg.setAttribute('aria-label', options.title);
    const background = document.createElementNS(NS, 'rect');
    background.setAttribute('width', String(n));
    background.setAttribute('height', String(n));
    background.setAttribute('fill', '#ffffff');
    let d = '';
    qr.modules.forEach((row, y) => row.forEach((isDark, x) => { if (isDark) d += `M${x + margin},${y + margin}h1v1h-1z`; }));
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#10251b');
    svg.append(background, path);
    return svg;
  }

  global.BSMEQR = { encode, toSvg };
})(typeof window !== 'undefined' ? window : globalThis);
