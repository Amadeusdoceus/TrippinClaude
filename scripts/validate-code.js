/**
 * validate-code.js — FLUXO DE REVISÃO DE CÓDIGO do Trippin.
 * ----------------------------------------------------------------
 * Objetivo: pegar, ANTES de qualquer push/deploy, o erro que já causou
 * "tela em branco" mais de uma vez — parênteses/chaves desbalanceados no
 * único <script> gigante do app/index.html.
 *
 * O que faz:
 *   1. Extrai cada <script> inline (sem atributo src) do app/index.html,
 *      roda `node --check` e mapeia o número da linha do erro de volta
 *      para a linha real do index.html.
 *   2. Valida os JS externos (app/config.js, app/src/trippin-api.js).
 *   3. Faz uma contagem de balanceamento de () [] {} que ignora strings,
 *      template literals, regex e comentários — para dar uma mensagem
 *      amigável apontando se algo abriu e não fechou.
 *
 * Uso:   node scripts/validate-code.js
 * Saída: código 0 se tudo OK; 1 se houver erro (trava o push).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');

let failures = 0;
const ok = m => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = m => { console.log('  \x1b[31m✗\x1b[0m ' + m); failures++; };

/** Roda `node --check` num pedaço de código; devolve {ok, line, message}. */
function nodeCheck(code) {
  const tmp = path.join(os.tmpdir(), 'trippin-check-' + process.pid + '-' + Math.floor(performance.now()) + '.js');
  fs.writeFileSync(tmp, code, 'utf8');
  try {
    cp.execSync(`node --check "${tmp}"`, { stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    const out = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '');
    // node aponta a linha como  arquivo:NN  (no Windows vem com \r\n)
    const m = out.match(/:(\d+)\r?\n/);
    const line = m ? parseInt(m[1], 10) : null;
    const msg = (out.split('\n').find(l => /SyntaxError/.test(l)) || out.trim().split('\n')[0] || 'erro de sintaxe').trim();
    return { ok: false, line, message: msg };
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

/** Contagem de balanceamento ignorando strings/regex/comentários. */
function balance(code) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const open = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  let i = 0, line = 1;
  const n = code.length;
  let prevSignificant = ''; // último caractere relevante (para distinguir regex de divisão)
  while (i < n) {
    const c = code[i], c2 = code[i + 1];
    if (c === '\n') { line++; i++; continue; }
    // comentário de linha
    if (c === '/' && c2 === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    // comentário de bloco
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') line++; i++; } i += 2; continue; }
    // strings
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < n && code[i] !== q) { if (code[i] === '\\') i++; if (code[i] === '\n') line++; i++; }
      i++; prevSignificant = q; continue;
    }
    // template literal (não trata ${} aninhado a fundo, mas conta chaves dentro)
    if (c === '`') {
      i++;
      while (i < n && code[i] !== '`') { if (code[i] === '\\') i++; if (code[i] === '\n') line++; i++; }
      i++; prevSignificant = '`'; continue;
    }
    // regex literal: heurística — '/' após operador/abre-parêntese/vírgula/retorno
    if (c === '/' && /[(,=:[!&|?{;]|return|typeof/.test(prevSignificant)) {
      i++;
      let inClass = false;
      while (i < n && (code[i] !== '/' || inClass)) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '[') inClass = true;
        else if (code[i] === ']') inClass = false;
        if (code[i] === '\n') line++;
        i++;
      }
      i++; prevSignificant = '/'; continue;
    }
    if (open[c]) { stack.push({ c, line }); prevSignificant = c; i++; continue; }
    if (pairs[c]) {
      const top = stack.pop();
      if (!top || top.c !== pairs[c]) {
        return { ok: false, line, message: `'${c}' inesperado na linha ${line}` + (top ? ` (esperava fechar '${top.c}' aberto na linha ${top.line})` : ' (nada aberto)') };
      }
      prevSignificant = c; i++; continue;
    }
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  if (stack.length) {
    const t = stack[stack.length - 1];
    return { ok: false, line: t.line, message: `'${t.c}' aberto na linha ${t.line} nunca foi fechado` };
  }
  return { ok: true };
}

/** Extrai blocos <script> inline (sem src) com a linha inicial no arquivo. */
function extractInlineScripts(html) {
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue; // externo, pulamos
    const before = html.slice(0, m.index);
    const startLine = before.split('\n').length;
    const openTagLines = (m[0].slice(0, m[0].indexOf('>') + 1).match(/\n/g) || []).length;
    blocks.push({ code: m[2], startLine: startLine + openTagLines });
  }
  return blocks;
}

console.log('\n\x1b[1mTrippin · Revisão de código (validate-code)\x1b[0m\n');

// 1. index.html — scripts inline
const indexPath = path.join(APP, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const inline = extractInlineScripts(html);
if (!inline.length) bad('index.html — nenhum <script> inline encontrado (estrutura mudou?)');
inline.forEach((b, idx) => {
  const label = `index.html · script inline #${idx + 1} (começa na linha ${b.startLine})`;
  const chk = nodeCheck(b.code);
  if (chk.ok) {
    ok(label + ' — sintaxe OK');
  } else {
    const realLine = chk.line ? b.startLine + chk.line - 1 : '?';
    bad(`${label} — ${chk.message}  →  index.html linha ~${realLine}`);
    const bal = balance(b.code);
    if (!bal.ok) console.log('      dica de balanceamento: ' + bal.message.replace(/linha (\d+)/g, (_, l) => 'linha ' + (b.startLine + parseInt(l, 10) - 1)));
  }
});

// 2. JS externos
[['config.js', path.join(APP, 'config.js')], ['src/trippin-api.js', path.join(APP, 'src', 'trippin-api.js')]].forEach(([name, p]) => {
  if (!fs.existsSync(p)) { bad(`${name} — arquivo não encontrado`); return; }
  const chk = nodeCheck(fs.readFileSync(p, 'utf8'));
  chk.ok ? ok(`${name} — sintaxe OK`) : bad(`${name} — ${chk.message} (linha ${chk.line})`);
});

console.log('');
if (failures) {
  console.log(`\x1b[31m✗ Revisão de código FALHOU (${failures} problema(s)). Corrija antes do push.\x1b[0m\n`);
  process.exit(1);
} else {
  console.log('\x1b[32m✓ Revisão de código OK — sem erros de sintaxe/balanceamento.\x1b[0m\n');
}
