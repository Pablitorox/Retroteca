/* Retroteca - servidor local (PC).
 *   node serve.js            -> http://localhost:8790
 *   node serve.js --abrir    -> abre o Edge em tela cheia (modo quiosque) e encerra junto com ele
 * Le as ROMs e o gamelist.xml (formato Batocera/EmulationStation) de config.json -> romsDir
 * e abre cada jogo no RetroArch com o core do console. Favoritos/recentes ficam em dados.json. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const { spawn, execFile } = require('child_process');

const here = __dirname;
const cfg = Object.assign({
    port: 8790,
    romsDir: 'E:/Jogos',
    retroarch: '',
    navegador: '',
    sistemas: {}
}, JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8')));
const ROMS = path.resolve(cfg.romsDir);
const DADOS = path.join(here, 'dados.json');
const CACHE = path.join(here, '.cache');

const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.json': 'application/json; charset=utf-8'
};

// ---------------------------------------------------------------- utilidades
function inside(base, p) {
    const r = path.resolve(base, p);
    return (r === base || r.startsWith(base + path.sep)) ? r : null;
}
function send(res, code, body, type) {
    res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
}
function json(res, obj, code) { send(res, code || 200, JSON.stringify(obj), types['.json']); }
function lerCorpo(req) {
    return new Promise(ok => {
        let s = '';
        req.on('data', c => { s += c; if (s.length > 1e5) req.destroy(); });
        req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { ok({}); } });
    });
}
function log() { console.log(new Date().toLocaleTimeString('pt-BR'), ...arguments); }

// ---------------------------------------------------------------- dados do usuario
let dados = { recentes: [], favoritos: [], tempo: {}, vezes: {} };
try { dados = Object.assign(dados, JSON.parse(fs.readFileSync(DADOS, 'utf8'))); } catch (e) {}
function salvarDados() {
    const tmp = DADOS + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 1));
    fs.renameSync(tmp, DADOS);
}

// ---------------------------------------------------------------- gamelist.xml
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
        if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
        return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
    });
}
function lerGamelist(arq) {
    const out = {};
    let xml = '';
    try { xml = fs.readFileSync(arq, 'utf8'); } catch (e) { return out; }
    const reGame = /<game\b[^>]*>([\s\S]*?)<\/game>/g;
    let m;
    while ((m = reGame.exec(xml))) {
        const g = {};
        const reTag = /<(\w+)>([\s\S]*?)<\/\1>/g;
        let t;
        while ((t = reTag.exec(m[1]))) g[t[1]] = decode(t[2].trim());
        if (g.path) out[rel(g.path).toLowerCase()] = g;
    }
    return out;
}
function rel(p) { return p.replace(/\\/g, '/').replace(/^\.\//, ''); }
function nomeLimpo(s) {
    return s.replace(/\s+:\s+/g, ': ').replace(/\s{2,}/g, ' ').trim();
}
function nomeDoArquivo(f) {
    return path.basename(f, path.extname(f)).replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/_/g, ' ').trim();
}

// ---------------------------------------------------------------- biblioteca
let biblioteca = null, bibliotecaEm = 0;
function montarBiblioteca() {
    const sistemas = [], jogos = [];
    let pastas = [];
    try { pastas = fs.readdirSync(ROMS, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch (e) {}
    const ordem = Object.keys(cfg.sistemas);
    pastas.sort((a, b) => {
        const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    for (const sys of pastas) {
        const sc = cfg.sistemas[sys];
        if (!sc) continue;                                  // so pastas de console configuradas
        const dir = path.join(ROMS, sys);
        const exts = sc.extensoes.map(e => e.toLowerCase());
        const gl = lerGamelist(path.join(dir, 'gamelist.xml'));
        const midia = {};
        for (const sub of ['images', 'thumbs', 'marquee', 'videos']) {
            midia[sub] = new Set();
            try { for (const f of fs.readdirSync(path.join(dir, sub))) midia[sub].add(f.toLowerCase()); } catch (e) {}
        }
        // ROMs que existem de fato (pasta do console + caminhos citados no gamelist)
        const roms = new Set();
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            if (f.isFile() && exts.includes(path.extname(f.name).toLowerCase())) roms.add(f.name);
        }
        for (const k of Object.keys(gl)) {
            const p = rel(gl[k].path);
            if (p.includes('/') && exts.includes(path.extname(p).toLowerCase()) && fs.existsSync(path.join(dir, p))) roms.add(p);
        }
        let n = 0;
        for (const r of roms) {
            const g = gl[r.toLowerCase()] || {};
            const base = path.basename(r, path.extname(r));
            const m = sub => {
                // caminho do gamelist se existir; senao o padrao <sub>/<nome da rom>.<ext>
                if (g[subTag(sub)]) {
                    const p = rel(g[subTag(sub)]);
                    if (p.startsWith(sub + '/') && midia[sub].has(p.slice(sub.length + 1).toLowerCase())) return url(sys, p);
                }
                const ext = sub === 'videos' ? ['.mp4'] : ['.png', '.jpg'];
                for (const e of ext) if (midia[sub].has((base + e).toLowerCase())) return url(sys, sub + '/' + base + e);
                return null;
            };
            const ano = /^(\d{4})/.exec(g.releasedate || '');
            const id = sys + '/' + r;
            jogos.push({
                id, sys,
                nome: nomeLimpo(g.name || nomeDoArquivo(r)),
                desc: g.desc || '',
                capa: m('thumbs') || m('images'),          // thumbs = caixa; images = tela com moldura (exceto GBA)
                logo: m('marquee'),
                video: m('videos'),
                nota: g.rating ? Math.round(parseFloat(g.rating) * 100) / 10 : null,   // 0..10
                ano: ano ? +ano[1] : null,
                genero: g.genre || '',
                dev: g.developer || '',
                editora: g.publisher || '',
                jogadores: g.players || ''
            });
            n++;
        }
        sistemas.push({ id: sys, nome: sc.nome, curto: sc.curto || sc.nome, total: n, modo: sc.modo || 'web' });
    }
    jogos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base', numeric: true }));
    return { sistemas, jogos };
}
function subTag(sub) { return { images: 'image', thumbs: 'thumbnail', marquee: 'marquee', videos: 'video' }[sub]; }
function url(sys, p) { return '/m/' + [sys].concat(p.split('/')).map(encodeURIComponent).join('/'); }

function getBiblioteca() {
    if (!biblioteca || Date.now() - bibliotecaEm > 60000) {
        const t = Date.now();
        biblioteca = montarBiblioteca();
        bibliotecaEm = Date.now();
        log(`biblioteca: ${biblioteca.jogos.length} jogos em ${biblioteca.sistemas.length} consoles (${Date.now() - t} ms)`);
    }
    return biblioteca;
}

// ---------------------------------------------------------------- RetroArch
function acharRetroArch() {
    const cands = [cfg.retroarch,
        'C:/RetroArch-Win64/retroarch.exe', 'C:/RetroArch/retroarch.exe',
        path.join(process.env.APPDATA || '', 'RetroArch/retroarch.exe'),
        path.join(process.env.ProgramFiles || '', 'RetroArch/retroarch.exe'),
        path.join(process.env['ProgramFiles(x86)'] || '', 'Steam/steamapps/common/RetroArch/retroarch.exe')];
    for (const c of cands) if (c && fs.existsSync(c)) return path.resolve(c);
    return null;
}
const EMU = path.join(here, 'public', 'emu');
function estadoEmulador() {
    // so os consoles em modo "nativo" dependem do RetroArch instalado
    const exe = acharRetroArch();
    const faltando = [];
    const web = fs.existsSync(path.join(EMU, 'emulator.min.js'));
    for (const [sys, sc] of Object.entries(cfg.sistemas)) {
        if (modo(sys) === 'web') { if (!web || !fs.existsSync(path.join(EMU, 'cores', sc.coreWeb + '-wasm.data'))) faltando.push(sys); }
        else if (!exe || !fs.existsSync(path.join(path.dirname(exe), 'cores', sc.core + '.dll'))) faltando.push(sys);
    }
    return { exe, web, faltando };
}
function modo(sys) { return (cfg.sistemas[sys] && cfg.sistemas[sys].modo) || 'web'; }

function registrarSessao(id, seg) {
    if (!(seg >= 4)) return;
    dados.tempo[id] = (dados.tempo[id] || 0) + Math.round(seg);
    dados.vezes[id] = (dados.vezes[id] || 0) + 1;
    dados.recentes = [{ id, quando: Date.now() }].concat(dados.recentes.filter(r => r.id !== id)).slice(0, 40);
    salvarDados();
}

// ---------------------------------------------------------------- emulador web: ROM descompactada e saves no HD
// id do jogo vai na URL em base64url (nomes de ROM tem espacos, parenteses, virgulas...)
function jogoDe(b64) {
    let id;
    try { id = Buffer.from(b64, 'base64url').toString('utf8'); } catch (e) { return null; }
    return getBiblioteca().jogos.find(x => x.id === id) || null;
}
function arquivoRom(j) { return inside(path.join(ROMS, j.sys), j.id.slice(j.sys.length + 1)); }
function baseRom(j) { const f = j.id.slice(j.sys.length + 1); return path.basename(f, path.extname(f)); }

// le o maior arquivo de ROM de dentro do .zip (central directory). null = formato nao suportado aqui
// (zip64, outro metodo) -> o navegador recebe o .zip e o EmulatorJS descompacta
async function extrairDoZip(buf, exts) {
    const min = Math.max(0, buf.length - 65557);
    let e = buf.length - 22;
    while (e >= min && buf.readUInt32LE(e) !== 0x06054b50) e--;
    if (e < min) return null;
    const n = buf.readUInt16LE(e + 10);
    let p = buf.readUInt32LE(e + 16), melhor = null;
    for (let i = 0; i < n; i++) {
        if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
        const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), tam = buf.readUInt32LE(p + 24);
        const ln = buf.readUInt16LE(p + 28), lx = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
        const nome = buf.toString('utf8', p + 46, p + 46 + ln);
        if (!nome.endsWith('/') && exts.includes(path.extname(nome).toLowerCase()) && (!melhor || tam > melhor.tam)) melhor = { metodo, comp, tam, off, nome };
        p += 46 + ln + lx + lc;
    }
    if (!melhor || melhor.comp === 0xFFFFFFFF || buf.readUInt32LE(melhor.off) !== 0x04034b50) return null;
    const ini = melhor.off + 30 + buf.readUInt16LE(melhor.off + 26) + buf.readUInt16LE(melhor.off + 28);
    const bruto = buf.subarray(ini, ini + melhor.comp);
    if (melhor.metodo === 0) return bruto;
    if (melhor.metodo !== 8) return null;
    return new Promise((ok, falha) => zlib.inflateRaw(bruto, (err, d) => err ? falha(err) : ok(d)));
}
// guarda so a ultima ROM (reabrir/reiniciar o mesmo jogo e instantaneo; HEAD + GET do EmulatorJS leem uma vez so)
let romCache = { id: null, dados: null, carregando: null };
function lerRom(j) {
    if (romCache.id === j.id) return romCache.carregando;
    const exts = cfg.sistemas[j.sys].extensoes.filter(x => x !== '.zip' && x !== '.7z');
    romCache = { id: j.id, carregando: (async () => {
        const t = Date.now();
        const buf = await fs.promises.readFile(arquivoRom(j));
        let dados = buf;
        if (path.extname(j.id).toLowerCase() === '.zip') {
            try { dados = (await extrairDoZip(buf, exts)) || buf; } catch (e) { dados = buf; }
        }
        log('rom:', j.nome, (dados.length / 1048576).toFixed(1) + ' MB em', Date.now() - t, 'ms');
        return dados;
    })() };
    romCache.carregando.catch(() => { romCache = { id: null }; });
    return romCache.carregando;
}
function arquivoSave(j, tipo) {
    // mesmos nomes do RetroArch nativo: os dois modos usam os mesmos saves
    return tipo === 'srm' ? path.join(ROMS, '_saves', j.sys, baseRom(j) + '.srm')
        : path.join(ROMS, '_states', j.sys, baseRom(j) + '.state.auto');
}
function lerCorpoBinario(req, limite) {
    return new Promise((ok, falha) => {
        const partes = []; let total = 0;
        req.on('data', c => { total += c.length; if (total > limite) { falha(new Error('grande demais')); req.destroy(); } else partes.push(c); });
        req.on('end', () => ok(Buffer.concat(partes)));
        req.on('error', falha);
    });
}

let jogando = null, ultimoErro = null;
function jogar(id) {
    const bib = getBiblioteca();
    const j = bib.jogos.find(x => x.id === id);
    if (!j) return { erro: 'Jogo não encontrado' };
    if (jogando) return { erro: 'Já tem um jogo aberto' };
    const exe = acharRetroArch();
    if (!exe) return { erro: 'RetroArch não está instalado' };
    const sc = cfg.sistemas[j.sys];
    const core = path.join(path.dirname(exe), 'cores', sc.core + '.dll');
    if (!fs.existsSync(core)) return { erro: 'Core ' + sc.core + ' não está instalado' };
    const rom = inside(path.join(ROMS, j.sys), id.slice(j.sys.length + 1));
    if (!rom || !fs.existsSync(rom)) return { erro: 'Arquivo do jogo não encontrado' };

    // configuracao extra por console: tela cheia, saves no HD, auto-save de estado (retoma de onde parou)
    fs.mkdirSync(CACHE, { recursive: true });
    const saves = path.join(ROMS, '_saves', j.sys), states = path.join(ROMS, '_states', j.sys);
    fs.mkdirSync(saves, { recursive: true });
    fs.mkdirSync(states, { recursive: true });
    const extra = path.join(CACHE, 'ra-' + j.sys + '.cfg');
    const q = s => '"' + s.replace(/\\/g, '/') + '"';
    fs.writeFileSync(extra, [
        'video_fullscreen = "true"',
        'pause_nonactive = "false"',
        'savefile_directory = ' + q(saves),
        'savestate_directory = ' + q(states),
        'savestate_auto_save = ' + q(cfg.retomar === false ? 'false' : 'true'),
        'savestate_auto_load = ' + q(cfg.retomar === false ? 'false' : 'true'),
        'input_quit_gamepad_combo = "4"',            // Start + Select (duas vezes) fecha o jogo
        'input_menu_toggle_gamepad_combo = "2"',     // L3 + R3 abre o menu do RetroArch
        ''].join('\n'));

    const args = ['-L', core, rom, '--appendconfig', extra];
    log('jogar:', j.nome, '|', sc.core);
    let proc;
    try {
        proc = spawn(exe, args, { cwd: path.dirname(exe), stdio: 'ignore', windowsHide: false });
    } catch (e) { return { erro: 'Falha ao abrir o RetroArch: ' + e.message }; }
    const inicio = Date.now();
    jogando = { id, nome: j.nome, inicio, pid: proc.pid };
    ultimoErro = null;
    proc.on('error', e => { ultimoErro = 'Falha ao abrir o RetroArch: ' + e.message; jogando = null; });
    proc.on('exit', code => {
        const seg = Math.round((Date.now() - inicio) / 1000);
        log('fim:', j.nome, '| codigo', code, '|', seg, 's');
        if (seg < 4 && code) ultimoErro = 'O emulador fechou ao abrir o jogo (código ' + code + ')';
        registrarSessao(id, seg);
        jogando = null;
    });
    return { ok: true };
}

// ---------------------------------------------------------------- arquivos estaticos e midia (com Range p/ video)
function servirArquivo(req, res, f) {
    let st;
    try { st = fs.statSync(f); } catch (e) { return send(res, 404, 'nao encontrado'); }
    if (!st.isFile()) return send(res, 404, 'nao encontrado');
    const type = types[path.extname(f).toLowerCase()] || 'application/octet-stream';
    // midia do HD: 1 dia; emulador e cores (versao fixa): 30 dias; interface: sem cache (edicao ao vivo)
    const cache = f.startsWith(ROMS) ? 'max-age=86400' : f.startsWith(EMU + path.sep) ? 'max-age=2592000' : 'no-store';
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache };
    const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (r) {
        let a = r[1] === '' ? st.size - parseInt(r[2], 10) : parseInt(r[1], 10);
        let b = r[1] !== '' && r[2] !== '' ? parseInt(r[2], 10) : st.size - 1;
        if (isNaN(a) || a < 0 || a >= st.size || b < a) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
        b = Math.min(b, st.size - 1);
        res.writeHead(206, Object.assign(head, { 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 }));
        return fs.createReadStream(f, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, Object.assign(head, { 'Content-Length': st.size }));
    fs.createReadStream(f).pipe(res);
}

// ---------------------------------------------------------------- navegador em modo quiosque
let navegador = null;
function abrirNavegador() {
    const cands = [cfg.navegador,
        path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
        path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
        path.join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe')];
    const exe = cands.find(c => c && fs.existsSync(c));
    if (!exe) { log('navegador nao encontrado; abra http://localhost:' + cfg.port); return; }
    const perfil = path.join(os.tmpdir(), 'retroteca-perfil');
    navegador = spawn(exe, ['--kiosk', 'http://localhost:' + cfg.port + '/', '--edge-kiosk-type=fullscreen',
        '--user-data-dir=' + perfil, '--no-first-run', '--autoplay-policy=no-user-gesture-required',
        '--disable-features=Translate', '--disable-pinch', '--overscroll-history-navigation=0'], { stdio: 'ignore' });
    navegador.on('exit', () => { log('navegador fechado; encerrando'); process.exit(0); });
}
function sair() {
    if (navegador && navegador.pid) execFile('taskkill', ['/PID', String(navegador.pid), '/T', '/F'], () => process.exit(0));
    else setTimeout(() => process.exit(0), 200);
}

// ---------------------------------------------------------------- rotas
const pub = path.join(here, 'public');
const fontes = path.join(here, 'fonts');
http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    let p;
    try { p = decodeURIComponent(u.pathname); } catch (e) { return send(res, 400, 'url invalida'); }
    // isolamento de origem: libera SharedArrayBuffer -> cores com threads (N64/DS mais rapidos)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    // ---- emulador web
    let m;
    if ((m = /^\/api\/jogo\/([\w-]+)$/.exec(p))) {
        const j = jogoDe(m[1]);
        if (!j) return json(res, { erro: 'Jogo não encontrado' }, 404);
        const sc = cfg.sistemas[j.sys];
        return json(res, { jogo: j, core: sc.coreWeb, threads: !!sc.threads, ext: sc.extRom, retomar: cfg.retomar !== false,
            temSave: fs.existsSync(arquivoSave(j, 'srm')), temEstado: fs.existsSync(arquivoSave(j, 'state')) });
    }
    if ((m = /^\/api\/preparar\/([\w-]+)$/.exec(p))) {
        // foco no botao Jogar: ja le (e descompacta) a ROM do HD, que pode estar "dormindo" (1-2 s no primeiro acesso)
        const j = jogoDe(m[1]);
        if (j && modo(j.sys) === 'web') lerRom(j).catch(() => {});
        res.writeHead(204); return res.end();
    }
    if ((m = /^\/rom\/([\w-]+)\/[^/]+$/.exec(p))) {
        const j = jogoDe(m[1]);
        if (!j) return send(res, 404, 'nao encontrado');
        let dados;
        try { dados = await lerRom(j); } catch (e) { return send(res, 500, 'falha ao ler a ROM'); }
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': dados.length, 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : dados);
    }
    if ((m = /^\/api\/save\/([\w-]+)\/(srm|state)$/.exec(p))) {
        const j = jogoDe(m[1]);
        if (!j) return send(res, 404, 'nao encontrado');
        const f = arquivoSave(j, m[2]);
        if (req.method === 'PUT') {
            try {
                const corpo = await lerCorpoBinario(req, 256 * 1048576);
                if (!corpo.length) return json(res, { ok: false });
                fs.mkdirSync(path.dirname(f), { recursive: true });
                await fs.promises.writeFile(f + '.tmp', corpo);
                await fs.promises.rename(f + '.tmp', f);
                return json(res, { ok: true, bytes: corpo.length });
            } catch (e) { return json(res, { erro: e.message }, 500); }
        }
        return fs.existsSync(f) ? servirArquivo(req, res, f) : send(res, 404, 'sem save');
    }
    if (p === '/api/sessao' && req.method === 'POST') {
        const b = await lerCorpo(req);
        registrarSessao(String(b.id || ''), Number(b.segundos) || 0);
        return json(res, { ok: true, dados });
    }

    if (p === '/api/biblioteca') {
        if (u.searchParams.has('recarregar')) biblioteca = null;
        const b = getBiblioteca();
        return json(res, { sistemas: b.sistemas, jogos: b.jogos, dados, emulador: estadoEmulador(), quiosque: !!navegador });
    }
    if (p === '/api/status') return json(res, { jogando, erro: ultimoErro, dados });
    if (p === '/api/jogar' && req.method === 'POST') {
        const b = await lerCorpo(req);
        return json(res, jogar(String(b.id || '')));
    }
    if (p === '/api/favorito' && req.method === 'POST') {
        const b = await lerCorpo(req);
        const id = String(b.id || '');
        dados.favoritos = dados.favoritos.filter(x => x !== id);
        if (b.on) dados.favoritos.unshift(id);
        salvarDados();
        return json(res, { ok: true, favoritos: dados.favoritos });
    }
    if (p === '/api/sair' && req.method === 'POST') { json(res, { ok: true }); return sair(); }

    if (p.startsWith('/m/')) {
        const f = inside(ROMS, p.slice(3));
        // so midia (nada de ROM/saves pela web)
        if (!f || !/^[^/\\]+[/\\](images|thumbs|marquee|videos)[/\\]/.test(path.relative(ROMS, f))) return send(res, 403, 'proibido');
        return servirArquivo(req, res, f);
    }
    if (p.startsWith('/fonts/')) {
        const f = inside(fontes, p.slice(7));
        return f ? servirArquivo(req, res, f) : send(res, 403, 'proibido');
    }
    const f = inside(pub, p === '/' ? 'index.html' : p.slice(1));
    return f ? servirArquivo(req, res, f) : send(res, 403, 'proibido');
}).listen(cfg.port, '127.0.0.1', () => {
    log('Retroteca em http://localhost:' + cfg.port + '  (ROMs: ' + ROMS + ')');
    const e = estadoEmulador();
    if (!e.web) log('AVISO: emulador web nao instalado - rode: node instalar-emulador.js');
    if (e.faltando.length) log('AVISO: emulador indisponivel para: ' + e.faltando.join(', '));
    getBiblioteca();
    if (process.argv.includes('--abrir')) abrirNavegador();
}).on('error', e => {
    if (e.code === 'EADDRINUSE' && process.argv.includes('--abrir')) {
        log('servidor ja estava rodando; abrindo so o navegador');
        abrirNavegador();
    } else { console.error(e.message); process.exit(1); }
});
