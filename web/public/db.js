/* Armazenamento da versao web:
 * - ROMs e saves ficam no IndexedDB deste navegador (a ROM nunca sai do aparelho)
 * - com um codigo de sincronizacao, os saves tambem vao para a nuvem (/api/save, Vercel Blob)
 *   e o mais recente vence ao abrir o jogo */
(function () {
    'use strict';
    var SISTEMAS = {
        gb:  { nome: 'Game Boy',         core: 'gambatte', ext: '.gb',  thumbs: 'Nintendo - Game Boy' },
        gbc: { nome: 'Game Boy Color',   core: 'gambatte', ext: '.gbc', thumbs: 'Nintendo - Game Boy Color' },
        gba: { nome: 'Game Boy Advance', core: 'mgba',     ext: '.gba', thumbs: 'Nintendo - Game Boy Advance' }
    };

    var aberto = null;
    function abrir() {
        if (aberto) return aberto;
        aberto = new Promise(function (ok, falha) {
            var r = indexedDB.open('retroteca', 1);
            r.onupgradeneeded = function () {
                var db = r.result;
                db.createObjectStore('roms', { keyPath: 'id' });
                db.createObjectStore('saves');                 // chave: <id>/<srm|state> -> { dados, em }
            };
            r.onsuccess = function () { ok(r.result); };
            r.onerror = function () { falha(r.error); };
        });
        return aberto;
    }
    function op(loja, modo, fn) {
        return abrir().then(function (db) {
            return new Promise(function (ok, falha) {
                var tx = db.transaction(loja, modo), req = fn(tx.objectStore(loja));
                tx.oncomplete = function () { ok(req && req.result); };
                tx.onerror = function () { falha(tx.error); };
            });
        });
    }

    // ------------------------------------------------------------ ROMs
    function sistemaDoNome(nome) {
        var m = /\.(gba|gbc|gb)$/i.exec(nome);
        return m ? m[1].toLowerCase() : null;
    }
    function nomeDentroDoZip(buf) {
        // primeiro arquivo do .zip (cabecalho local): basta para saber o console
        var v = new DataView(buf);
        if (buf.byteLength < 30 || v.getUint32(0, true) !== 0x04034b50) return '';
        var n = v.getUint16(26, true);
        return new TextDecoder().decode(new Uint8Array(buf, 30, Math.min(n, buf.byteLength - 30)));
    }
    function limparNome(arquivo) {
        return arquivo.replace(/\.[^.]+$/, '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').trim() || arquivo;
    }
    function adicionar(file) {
        return file.arrayBuffer().then(function (buf) {
            var ext = /\.[^.]+$/.exec(file.name); ext = ext ? ext[0].toLowerCase() : '';
            var sis = sistemaDoNome(file.name) || (ext === '.zip' ? sistemaDoNome(nomeDentroDoZip(buf)) : null);
            if (!sis) throw new Error(file.name + ': não é uma ROM de GB, GBC ou GBA');
            var base = file.name.replace(/\.[^.]+$/, '');
            var rom = {
                id: sis + '-' + base.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_').slice(0, 80),
                arquivo: base, nome: limparNome(base), sistema: sis, ext: ext,
                dados: new Blob([buf]), adicionado: Date.now(), jogado: 0
            };
            return op('roms', 'readwrite', function (s) { return s.put(rom); }).then(function () { return rom; });
        });
    }
    // ------------------------------------------------------------ patches .bps (hackroms)
    var tabelaCrc = null;
    function crc32(u8) {
        if (!tabelaCrc) {
            tabelaCrc = new Uint32Array(256);
            for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tabelaCrc[n] = c; }
        }
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < u8.length; i++) crc = tabelaCrc[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    // formato BPS (byuu/beat): devolve a ROM nova ou lanca um erro explicando o problema
    function aplicarBps(patch, base) {
        var p = new Uint8Array(patch), src = new Uint8Array(base), pos = 4;
        if (p.length < 19 || String.fromCharCode(p[0], p[1], p[2], p[3]) !== 'BPS1') throw new Error('O patch não é um .bps válido');
        var v = new DataView(p.buffer, p.byteOffset + p.length - 12, 12);
        var crcBase = v.getUint32(0, true), crcFinal = v.getUint32(4, true);
        if (crc32(p.subarray(0, p.length - 4)) !== v.getUint32(8, true)) throw new Error('O arquivo do patch está corrompido (baixe de novo)');
        if (crc32(src) !== crcBase) throw new Error('Essa não é a ROM base certa para este patch (confira a versão indicada no README da hack)');
        function num() {
            var dado = 0, mult = 1;
            for (;;) {
                var x = p[pos++];
                dado += (x & 0x7f) * mult;
                if (x & 0x80) return dado;
                mult *= 128; dado += mult;
            }
        }
        num();                                   // tamanho da base (ja conferida pelo CRC)
        var out = new Uint8Array(num());
        var meta = num(); pos += meta;           // metadados (nao usar pos += num(): pos seria lido antes de avancar)
        var o = 0, relSrc = 0, relOut = 0, fim = p.length - 12;
        while (pos < fim) {
            var d = num(), cmd = d % 4, len = Math.floor(d / 4) + 1, off;
            if (cmd === 0) { out.set(src.subarray(o, o + len), o); o += len; }
            else if (cmd === 1) { out.set(p.subarray(pos, pos + len), o); pos += len; o += len; }
            else if (cmd === 2) {
                off = num(); relSrc += (off & 1 ? -1 : 1) * Math.floor(off / 2);
                out.set(src.subarray(relSrc, relSrc + len), o); relSrc += len; o += len;
            } else {
                off = num(); relOut += (off & 1 ? -1 : 1) * Math.floor(off / 2);
                while (len--) out[o++] = out[relOut++];   // byte a byte: a copia pode sobrepor o que acabou de ser escrito
            }
        }
        if (crc32(out) !== crcFinal) throw new Error('O patch foi aplicado, mas o resultado não confere');
        return out;
    }
    function adicionarComPatch(patchFile, baseFile) {
        return Promise.all([patchFile.arrayBuffer(), baseFile.arrayBuffer()]).then(function (b) {
            var rom = aplicarBps(b[0], b[1]);
            var ext = (/\.(gba|gbc|gb)$/i.exec(baseFile.name) || ['.gba'])[0].toLowerCase();
            var nome = patchFile.name.replace(/\.bps$/i, '').replace(/\s*patch\s*/i, ' ').trim();
            return adicionar(new File([rom], nome + ext));
        });
    }

    function listar() { return op('roms', 'readonly', function (s) { return s.getAll(); }); }
    function rom(id) { return op('roms', 'readonly', function (s) { return s.get(id); }); }
    function marcarJogado(id) {
        return rom(id).then(function (r) { if (r) { r.jogado = Date.now(); return op('roms', 'readwrite', function (s) { return s.put(r); }); } });
    }
    function remover(id) { return op('roms', 'readwrite', function (s) { return s.delete(id); }); }
    function capa(r) {
        // capas do projeto libretro-thumbnails (nome No-Intro do arquivo)
        var nome = r.arquivo.replace(/[&*\/:`<>?\\|"]/g, '_');
        return 'https://thumbnails.libretro.com/' + encodeURIComponent(SISTEMAS[r.sistema].thumbs) + '/Named_Boxarts/' + encodeURIComponent(nome) + '.png';
    }

    // ------------------------------------------------------------ saves (local + nuvem)
    function codigo() { try { return localStorage.getItem('retroteca.codigo') || ''; } catch (e) { return ''; } }
    function definirCodigo(c) { try { if (c) localStorage.setItem('retroteca.codigo', c); else localStorage.removeItem('retroteca.codigo'); } catch (e) {} }

    function local(id, tipo) { return op('saves', 'readonly', function (s) { return s.get(id + '/' + tipo); }); }
    function gravarLocal(id, tipo, dados, em) {
        return op('saves', 'readwrite', function (s) { return s.put({ dados: dados, em: em }, id + '/' + tipo); });
    }
    function url(id, tipo, extra) {
        return '/api/save?j=' + encodeURIComponent(id) + '&t=' + tipo + (extra || '');
    }
    function nuvemMeta(id, tipo) {
        var c = codigo(); if (!c) return Promise.resolve(null);
        return fetch(url(id, tipo, '&meta=1'), { headers: { 'x-codigo': c }, cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    function nuvemBaixar(id, tipo) {
        return fetch(url(id, tipo), { headers: { 'x-codigo': codigo() }, cache: 'no-store' })
            .then(function (r) { return r.ok ? r.arrayBuffer().then(function (b) { return new Uint8Array(b); }) : null; })
            .catch(function () { return null; });
    }
    // devolve o save mais recente entre este navegador e a nuvem (e atualiza o local se a nuvem ganhar)
    function carregar(id, tipo) {
        return Promise.all([local(id, tipo), nuvemMeta(id, tipo)]).then(function (r) {
            var loc = r[0], nuv = r[1];
            if (!nuv || !nuv.em) return loc ? loc.dados : null;
            if (loc && loc.em >= nuv.em) return loc.dados;
            return nuvemBaixar(id, tipo).then(function (d) {
                if (!d) return loc ? loc.dados : null;
                return gravarLocal(id, tipo, d, nuv.em).then(function () { return d; });
            });
        });
    }
    // grava aqui e na nuvem; resolve com 'nuvem', 'local' (sem codigo ou sem rede) ou false
    function salvar(id, tipo, dados) {
        var em = Date.now();
        return gravarLocal(id, tipo, dados, em).then(function () {
            var c = codigo(); if (!c) return 'local';
            return fetch(url(id, tipo), { method: 'PUT', body: dados, headers: { 'x-codigo': c, 'Content-Type': 'application/octet-stream' } })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (r) {
                    if (!r) return 'local';
                    // passa a usar a hora do servidor: e com ela que a nuvem e comparada
                    return gravarLocal(id, tipo, dados, r.em).then(function () { return 'nuvem'; });
                }).catch(function () { return 'local'; });
        }).catch(function () { return false; });
    }
    // fechando a aba: so da tempo de um envio "keepalive" (limite de 64 KB, cobre o .srm)
    function salvarAoFechar(id, dados) {
        var em = Date.now();
        gravarLocal(id, 'srm', dados, em);
        var c = codigo();
        if (c && dados.length < 60000) {
            try { fetch(url(id, 'srm'), { method: 'PUT', body: dados, keepalive: true, headers: { 'x-codigo': c } }); } catch (e) {}
        }
    }

    window.Retro = {
        SISTEMAS: SISTEMAS, adicionar: adicionar, adicionarComPatch: adicionarComPatch, aplicarBps: aplicarBps, crc32: crc32, listar: listar, rom: rom, remover: remover, marcarJogado: marcarJogado, capa: capa,
        codigo: codigo, definirCodigo: definirCodigo, carregar: carregar, salvar: salvar, salvarAoFechar: salvarAoFechar
    };
})();
