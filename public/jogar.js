/* Tela de jogo: roda o EmulatorJS dentro de um iframe da interface.
 * - ROM vem do servidor ja descompactada (/rom/...), saves e estado ficam no HD (/api/save/...)
 * - o nome da ROM no sistema de arquivos do emulador e o id do jogo em base64url: cada jogo tem
 *   seu proprio .srm no IndexedDB interno do EmulatorJS (nunca mistura save de jogos diferentes)
 * - menu proprio (Start+Select, Home ou Esc): continuar, salvar, carregar, reiniciar, sair
 * - ao sair salva o .srm e o estado (retoma de onde parou) e avisa a interface via postMessage */
(function () {
    'use strict';
    var $ = function (s) { return document.querySelector(s); };
    var b64 = new URLSearchParams(location.search).get('id') || '';
    var info = null, inicio = 0, saindo = false, menuAberto = false, iniciado = false;
    var ultimoSrm = null;           // assinatura do ultimo .srm enviado (evita reenviar igual)

    function aviso(t, ms) {
        var a = $('#aviso'); a.textContent = t; a.classList.add('on');
        clearTimeout(aviso.t); aviso.t = setTimeout(function () { a.classList.remove('on'); }, ms || 2200);
    }
    function etapa(t) { $('#carEtapa').textContent = t; }
    function erro(t) {
        $('#carregando').classList.add('erro');
        document.querySelector('.car-selo').textContent = 'Não deu para abrir';
        etapa(t + ' — aperte B ou Esc para voltar.');
        iniciado = false;
    }
    function avisarPai(msg) { if (parent !== window) parent.postMessage(msg, location.origin); }
    function bin(url) {
        return fetch(url).then(function (r) { return r.ok ? r.arrayBuffer().then(function (b) { return new Uint8Array(b); }) : null; }).catch(function () { return null; });
    }
    function assinatura(u8) {
        // FNV-1a amostrado: barato mesmo para saves grandes, suficiente para saber se mudou
        var h = 2166136261, passo = Math.max(1, Math.floor(u8.length / 4096));
        for (var i = 0; i < u8.length; i += passo) { h ^= u8[i]; h = Math.imul(h, 16777619); }
        return u8.length + ':' + (h >>> 0);
    }
    function enviar(tipo, u8) {
        return fetch('/api/save/' + b64 + '/' + tipo, { method: 'PUT', body: u8, headers: { 'Content-Type': 'application/octet-stream' } })
            .then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    // ------------------------------------------------------------ saves
    function gm() { return window.EJS_emulator && window.EJS_emulator.gameManager; }
    function salvarSrm() {
        var g = gm(); if (!g || !iniciado) return Promise.resolve(false);
        var d; try { d = g.getSaveFile(); } catch (e) { d = null; }
        if (!d || !d.length) return Promise.resolve(false);
        var s = assinatura(d);
        if (s === ultimoSrm) return Promise.resolve(true);
        return enviar('srm', d).then(function (ok) { if (ok) ultimoSrm = s; return ok; });
    }
    function salvarEstado() {
        var g = gm(); if (!g || !iniciado) return Promise.resolve(false);
        try { if (!g.supportsStates()) return Promise.resolve(false); } catch (e) {}
        var st; try { st = g.getState(); } catch (e) { return Promise.resolve(false); }
        return enviar('state', st);
    }
    function carregarEstado() {
        return bin('/api/save/' + b64 + '/state').then(function (st) {
            if (!st || !st.length) { aviso('Nenhum progresso salvo ainda'); return false; }
            try { gm().loadState(st); return true; } catch (e) { aviso('Não consegui carregar o progresso'); return false; }
        });
    }

    // ------------------------------------------------------------ menu de pausa
    var OPCOES = [
        { id: 'continuar', txt: 'Continuar', dica: 'B', principal: true },
        { id: 'salvar', txt: 'Salvar progresso', dica: 'retomar daqui depois' },
        { id: 'carregar', txt: 'Voltar ao progresso salvo', dica: '' },
        { id: 'reiniciar', txt: 'Reiniciar o jogo', dica: '' },
        { id: 'sair', txt: 'Sair do jogo', dica: 'salva sozinho' }
    ];
    var focoMenu = 0;
    function montarMenu() {
        var box = $('#menuOpcoes'); box.innerHTML = '';
        OPCOES.forEach(function (o, i) {
            var b = document.createElement('button');
            b.className = 'opcao' + (o.principal ? ' principal' : '');
            b.dataset.i = i;
            b.textContent = o.txt;
            if (o.dica) { var s = document.createElement('small'); s.textContent = o.dica; b.appendChild(s); }
            b.addEventListener('click', function () { focoMenu = i; escolher(); });
            box.appendChild(b);
        });
    }
    function pintarMenu() { document.querySelectorAll('.opcao').forEach(function (b, i) { b.classList.toggle('foco', i === focoMenu); }); }
    function abrirMenu() {
        if (!iniciado || menuAberto || saindo) return;
        menuAberto = true; focoMenu = 0;
        try { window.EJS_emulator.pause(); } catch (e) {}
        document.body.classList.remove('jogando');
        $('#menu').hidden = false; pintarMenu();
    }
    function fecharMenu() {
        if (!menuAberto) return;
        menuAberto = false;
        $('#menu').hidden = true;
        document.body.classList.add('jogando');
        try { window.EJS_emulator.play(); } catch (e) {}
        focarJogo();
    }
    function escolher() {
        var o = OPCOES[focoMenu].id;
        if (o === 'continuar') return fecharMenu();
        if (o === 'sair') return sair();
        if (o === 'salvar') {
            Promise.all([salvarSrm(), salvarEstado()]).then(function (r) { aviso(r[1] ? 'Progresso salvo no HD' : 'Este jogo não permite salvar estado'); });
            return fecharMenu();
        }
        if (o === 'carregar') { carregarEstado().then(function (ok) { if (ok) aviso('Progresso carregado'); }); return fecharMenu(); }
        if (o === 'reiniciar') { try { gm().restart(); } catch (e) {} return fecharMenu(); }
    }

    function sair() {
        if (saindo) return;
        saindo = true;
        $('#menu').hidden = true;
        var seg = iniciado ? (Date.now() - inicio) / 1000 : 0;
        if (iniciado) { aviso('Salvando…', 5000); try { window.EJS_emulator.pause(); } catch (e) {} }
        var salvar = iniciado ? Promise.all([salvarSrm(), info && info.retomar ? salvarEstado() : true]) : Promise.resolve();
        salvar.then(function () {
            return fetch('/api/sessao', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: info ? info.jogo.id : '', segundos: seg }) }).then(function (r) { return r.json(); }).catch(function () { return {}; });
        }).then(function (r) { avisarPai({ tipo: 'saiu', dados: r && r.dados }); });
    }

    // ------------------------------------------------------------ entrada (so o que e nosso; o resto vai para o jogo)
    function focarJogo() { var c = document.querySelector('#jogo canvas'); if (c) c.focus(); else window.focus(); }
    window.addEventListener('keydown', function (ev) {
        if (saindo) { ev.stopPropagation(); ev.preventDefault(); return; }
        if (!iniciado && (ev.key === 'Escape' || ev.key === 'Backspace')) { ev.preventDefault(); return sair(); }
        if (!menuAberto) {
            if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); abrirMenu(); }
            return;
        }
        // menu aberto: o teclado e do menu, o jogo nao recebe nada
        ev.preventDefault(); ev.stopPropagation();
        if (ev.key === 'ArrowDown') { focoMenu = (focoMenu + 1) % OPCOES.length; pintarMenu(); }
        else if (ev.key === 'ArrowUp') { focoMenu = (focoMenu + OPCOES.length - 1) % OPCOES.length; pintarMenu(); }
        else if (ev.key === 'Enter' || ev.key === ' ') escolher();
        else if (ev.key === 'Escape' || ev.key === 'Backspace') fecharMenu();
    }, true);
    window.addEventListener('keyup', function (ev) { if (menuAberto || saindo) { ev.stopPropagation(); } }, true);

    var antes = {}, combo = 0;
    function lerControle() {
        var pads = navigator.getGamepads ? navigator.getGamepads() : [], agora = {};
        for (var i = 0; i < pads.length; i++) {
            var p = pads[i]; if (!p || !p.connected) continue;
            var bt = function (n) { return p.buttons[n] && p.buttons[n].pressed; };
            if (bt(0)) agora.a = 1; if (bt(1)) agora.b = 1; if (bt(12)) agora.cima = 1; if (bt(13)) agora.baixo = 1;
            if (bt(8) && bt(9)) agora.combo = 1; if (bt(16)) agora.home = 1;
            var y = p.axes[1] || 0; if (y < -0.6) agora.cima = 1; if (y > 0.6) agora.baixo = 1;
        }
        var novo = function (k) { return agora[k] && !antes[k]; };
        if (!iniciado && !saindo && novo('b') && $('#carregando').classList.contains('erro')) sair();
        else if (menuAberto) {
            if (novo('baixo')) { focoMenu = (focoMenu + 1) % OPCOES.length; pintarMenu(); }
            if (novo('cima')) { focoMenu = (focoMenu + OPCOES.length - 1) % OPCOES.length; pintarMenu(); }
            if (novo('a')) escolher();
            else if (novo('b') || novo('home')) fecharMenu();
        } else if (iniciado && (novo('combo') || novo('home'))) abrirMenu();
        antes = agora;
        if (!saindo) requestAnimationFrame(lerControle);
    }

    // ------------------------------------------------------------ inicio
    var ETAPAS = [[/Download Game Core/i, 'Carregando o emulador'], [/Decompress Game Core/i, 'Preparando o emulador'],
        [/Download Game Data/i, 'Lendo o jogo do HD'], [/Decompress Game Data/i, 'Abrindo o jogo'], [/Download Game State/i, 'Carregando progresso']];
    function acompanharCarregamento() {
        var t = setInterval(function () {
            if (iniciado || saindo) return clearInterval(t);
            var el = document.querySelector('.ejs_loading_text');
            if (!el || !el.textContent) return;
            var txt = el.textContent;
            for (var i = 0; i < ETAPAS.length; i++) if (ETAPAS[i][0].test(txt)) { etapa(ETAPAS[i][1] + (txt.match(/\d+%/) ? ' ' + txt.match(/\d+%/)[0] : '') + '…'); return; }
            if (/error|failed|outdated/i.test(txt)) { clearInterval(t); erro(txt); }
        }, 150);
    }

    fetch('/api/jogo/' + b64).then(function (r) { return r.json(); }).then(function (r) {
        if (r.erro) return erro(r.erro);
        info = r;
        var j = info.jogo;
        document.title = j.nome;
        $('#carNome').textContent = j.nome; $('#menuNome').textContent = j.nome;
        if (j.capa) { $('#carCapa').src = j.capa; $('#menuCapa').src = j.capa; } else { $('#carCapa').hidden = true; $('#menuCapa').hidden = true; }
        montarMenu();
        // baixa o .srm do HD em paralelo com o emulador: precisa estar pronto antes do jogo ligar
        var srmPronto = info.temSave ? bin('/api/save/' + b64 + '/srm') : Promise.resolve(null);
        // testes de desempenho: jogar.html?id=...&core=desmume2015&threads=0
        var qs = new URLSearchParams(location.search);
        if (qs.get('core')) info.core = qs.get('core');
        if (qs.has('threads')) info.threads = qs.get('threads') === '1';
        var threads = !!(info.threads && window.crossOriginIsolated);

        window.EJS_player = '#jogo';
        window.EJS_core = info.core;
        window.EJS_gameUrl = '/rom/' + b64 + '/' + b64 + info.ext;   // nome unico por jogo (ver topo)
        window.EJS_gameName = j.nome;
        window.EJS_pathtodata = '/emu/';
        window.EJS_startOnLoaded = true;
        window.EJS_disableDatabases = true;      // nao copia ROM/core para o IndexedDB (ja estao no disco local)
        window.EJS_disableAutoLang = false;      // a interface do EmulatorJS fica escondida; evita baixar traducao
        window.EJS_threads = threads;
        window.EJS_volume = 0.8;
        window.EJS_color = '#1a8cff';
        window.EJS_backgroundColor = '#000000';
        window.EJS_Buttons = { playPause: false, restart: false, mute: false, settings: false, fullscreen: false, saveState: false,
            loadState: false, screenRecord: false, gamepad: false, cheat: false, volume: false, saveSavFiles: false, loadSavFiles: false,
            quickSave: false, quickLoad: false, screenshot: false, cacheManager: false, exitEmulation: false, netplay: false, diskButton: false,
            contextMenu: false };
        window.EJS_ready = function () {
            // antes do jogo ligar: grava o .srm do HD onde o core vai procurar
            window.EJS_emulator.on('saveDatabaseLoaded', function (FS) {
                return srmPronto.then(function (d) {
                    if (!d) return;
                    var ext = window.EJS_emulator.saveFileExt ? '.' + window.EJS_emulator.saveFileExt : '.srm';
                    try { FS.writeFile('/data/saves/' + b64 + ext, d); ultimoSrm = assinatura(d); } catch (e) { console.warn('srm', e); }
                });
            });
        };
        window.EJS_onGameStart = function () {
            iniciado = true;
            inicio = Date.now();
            document.body.classList.add('jogando');
            $('#carregando').classList.add('some');
            setTimeout(function () { $('#carregando').hidden = true; }, 400);
            focarJogo();
            var g = gm();
            // confere se o core usou o caminho esperado; se nao, carrega o .srm e reinicia para o jogo le-lo
            srmPronto.then(function (d) {
                if (!d) return;
                var p; try { p = g.getSaveFilePath(); } catch (e) { return; }
                if (p && p.indexOf(b64) < 0) { try { g.FS.writeFile(p, d); g.loadSaveFiles(); g.restart(); } catch (e) {} }
            });
            if (info.retomar && info.temEstado) {
                bin('/api/save/' + b64 + '/state').then(function (st) {
                    if (st && st.length) { try { g.loadState(st); aviso('Continuando de onde você parou'); } catch (e) {} }
                });
            }
            // salva a bateria (.srm) a cada 30 s, so se mudou
            setInterval(function () { if (!menuAberto && !saindo) salvarSrm(); }, 30000);
            avisarPai({ tipo: 'iniciou', threads: threads });
        };
        acompanharCarregamento();
        var s = document.createElement('script');
        s.src = '/emu/loader.js';
        s.onerror = function () { erro('Emulador não instalado (rode node instalar-emulador.js)'); };
        document.body.appendChild(s);
    }).catch(function () { erro('Servidor não respondeu'); });

    // janela fechando sem passar pelo menu: tenta ao menos guardar a bateria
    window.addEventListener('pagehide', function () {
        if (!iniciado || saindo) return;
        try { var d = gm().getSaveFile(); if (d && d.length < 60000) fetch('/api/save/' + b64 + '/srm', { method: 'PUT', body: d, keepalive: true }); } catch (e) {}
    });
    window.addEventListener('message', function (ev) {
        if (ev.origin === location.origin && ev.data && ev.data.tipo === 'sair') sair();
    });
    requestAnimationFrame(lerControle);
})();
