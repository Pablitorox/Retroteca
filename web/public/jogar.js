/* Tela de jogo da versao web (Vercel): mesmo fluxo da tela do PC, trocando o servidor local por:
 * - ROM lida do IndexedDB deste navegador (Retro.rom)
 * - emulador e cores vindos da CDN do EmulatorJS
 * - .srm e estado salvos aqui e na nuvem (Retro.carregar / Retro.salvar), o mais recente vence
 * Menu proprio (Start+Select, Home, Esc ou o botao no canto): continuar, salvar, carregar, reiniciar, sair */
(function () {
    'use strict';
    var EMU = 'https://cdn.emulatorjs.org/4.2.3/data/';
    var $ = function (s) { return document.querySelector(s); };
    var id = new URLSearchParams(location.search).get('id') || '';
    var jogo = null, saindo = false, menuAberto = false, iniciado = false;
    var ultimoSrm = null;           // assinatura do ultimo .srm salvo (evita regravar igual)
    var volume = (function () { try { var v = parseInt(localStorage.getItem('retroteca.volume'), 10); return isNaN(v) ? 80 : v; } catch (e) { return 80; } })();

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('toque');

    function aviso(t, ms) {
        var a = $('#aviso'); a.textContent = t; a.classList.add('on');
        clearTimeout(aviso.t); aviso.t = setTimeout(function () { a.classList.remove('on'); }, ms || 2200);
    }
    function etapa(t) { $('#carEtapa').textContent = t; }
    function erro(t) {
        $('#carregando').classList.add('erro');
        document.querySelector('.car-selo').textContent = 'Não deu para abrir';
        etapa(t + ' — toque aqui, aperte B ou Esc para voltar.');
        $('#carregando').addEventListener('click', sair);
        iniciado = false;
    }
    function assinatura(u8) {
        // FNV-1a amostrado: barato mesmo para saves grandes, suficiente para saber se mudou
        var h = 2166136261, passo = Math.max(1, Math.floor(u8.length / 4096));
        for (var i = 0; i < u8.length; i += passo) { h ^= u8[i]; h = Math.imul(h, 16777619); }
        return u8.length + ':' + (h >>> 0);
    }
    function ondeSalvou(r) { return r === 'nuvem' ? 'na nuvem' : 'neste navegador'; }

    // ------------------------------------------------------------ saves
    function gm() { return window.EJS_emulator && window.EJS_emulator.gameManager; }
    function salvarSrm() {
        var g = gm(); if (!g || !iniciado) return Promise.resolve(false);
        var d; try { d = g.getSaveFile(); } catch (e) { d = null; }
        if (!d || !d.length) return Promise.resolve(false);
        var s = assinatura(d);
        if (s === ultimoSrm) return Promise.resolve('igual');
        return Retro.salvar(id, 'srm', d).then(function (r) { if (r) ultimoSrm = s; return r; });
    }
    function salvarEstado() {
        var g = gm(); if (!g || !iniciado) return Promise.resolve(false);
        try { if (!g.supportsStates()) return Promise.resolve(false); } catch (e) {}
        var st; try { st = g.getState(); } catch (e) { return Promise.resolve(false); }
        return Retro.salvar(id, 'state', st);
    }
    function carregarEstado() {
        return Retro.carregar(id, 'state').then(function (st) {
            if (!st || !st.length) { aviso('Nenhum progresso salvo ainda'); return false; }
            try { gm().loadState(st); return true; } catch (e) { aviso('Não consegui carregar o progresso'); return false; }
        });
    }

    // ------------------------------------------------------------ menu de pausa
    var OPCOES = [
        { id: 'continuar', txt: 'Continuar', dica: 'B', principal: true },
        { id: 'volume', txt: 'Volume', dica: '' },
        { id: 'salvar', txt: 'Salvar progresso', dica: 'retomar daqui depois' },
        { id: 'carregar', txt: 'Voltar ao progresso salvo', dica: '' },
        { id: 'reiniciar', txt: 'Reiniciar o jogo', dica: '' },
        { id: 'sair', txt: 'Sair do jogo', dica: 'salva sozinho' }
    ];
    var focoMenu = 0;
    function montarMenu() {
        var box = $('#menuOpcoes'); box.innerHTML = '';
        OPCOES.forEach(function (o, i) {
            if (o.id === 'volume') return box.appendChild(linhaVolume(i));
            var b = document.createElement('button');
            b.className = 'opcao' + (o.principal ? ' principal' : '');
            b.textContent = o.txt;
            if (o.dica) { var s = document.createElement('small'); s.textContent = o.dica; b.appendChild(s); }
            b.addEventListener('click', function () { focoMenu = i; escolher(); });
            box.appendChild(b);
        });
    }
    // linha do volume: barra para puxar (toque/mouse) e setas/direcional de 5 em 5
    function linhaVolume(i) {
        var d = document.createElement('div');
        d.className = 'opcao volume'; d.id = 'opVolume';
        d.innerHTML = '<span>Volume</span><input type="range" min="0" max="100" step="1" aria-label="Volume"><small></small>';
        var r = d.querySelector('input');
        r.value = volume;
        r.addEventListener('input', function () { focoMenu = i; definirVolume(+r.value); pintarMenu(); });
        d.addEventListener('pointerdown', function () { focoMenu = i; pintarMenu(); });
        return d;
    }
    // volume (0 a 100): vale para todos os jogos e fica guardado neste navegador
    function definirVolume(v) {
        volume = Math.max(0, Math.min(100, Math.round(v)));
        try { localStorage.setItem('retroteca.volume', volume); } catch (e) {}
        aplicarVolume();
        pintarVolume();
    }
    function mudarVolume(passo) { definirVolume(volume + passo); }
    // setVolume so muda o som; o EmulatorJS volta a usar .volume ao despausar, entao guarda nos dois
    function aplicarVolume() {
        var e = window.EJS_emulator; if (!e) return;
        try { e.volume = volume / 100; e.setVolume(e.volume); } catch (x) {}
    }
    function pintarVolume() {
        var d = $('#opVolume'); if (!d) return;
        var r = d.querySelector('input');
        if (+r.value !== volume) r.value = volume;
        r.style.setProperty('--v', volume + '%');
        d.querySelector('small').textContent = volume ? volume + '%' : 'mudo';
    }
    function pintarMenu() {
        pintarVolume(); document.querySelectorAll('.opcao').forEach(function (b, i) { b.classList.toggle('foco', i === focoMenu); }); }
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
        if (o === 'volume') return;                          // a barra se ajusta pelas setas ou puxando
        if (o === 'sair') return sair();
        if (o === 'salvar') {
            Promise.all([salvarSrm(), salvarEstado()]).then(function (r) {
                aviso(r[1] ? 'Progresso salvo ' + ondeSalvou(r[1]) : 'Este jogo não permite salvar estado');
            });
            return fecharMenu();
        }
        if (o === 'carregar') { carregarEstado().then(function (ok) { if (ok) aviso('Progresso carregado'); }); return fecharMenu(); }
        if (o === 'reiniciar') { try { gm().restart(); } catch (e) {} return fecharMenu(); }
    }

    function sair() {
        if (saindo) return;
        saindo = true;
        $('#menu').hidden = true;
        if (iniciado) { aviso('Salvando…', 8000); try { window.EJS_emulator.pause(); } catch (e) {} }
        var salvar = iniciado ? Promise.all([salvarSrm(), salvarEstado()]) : Promise.resolve();
        salvar.then(function () { location.href = '/'; });
    }

    // ------------------------------------------------------------ entrada (so o que e nosso; o resto vai para o jogo)
    function focarJogo() { var c = document.querySelector('#jogo canvas'); if (c) c.focus(); else window.focus(); }
    $('#btnMenu').addEventListener('click', function (ev) { ev.preventDefault(); abrirMenu(); });
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
        else if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && OPCOES[focoMenu].id === 'volume') mudarVolume(ev.key === 'ArrowLeft' ? -5 : 5);
        else if (ev.key === 'Enter' || ev.key === ' ') escolher();
        else if (ev.key === 'Escape' || ev.key === 'Backspace') fecharMenu();
    }, true);
    window.addEventListener('keyup', function (ev) { if (menuAberto || saindo) { ev.stopPropagation(); } }, true);

    var antes = {};
    function lerControle() {
        var pads = navigator.getGamepads ? navigator.getGamepads() : [], agora = {};
        for (var i = 0; i < pads.length; i++) {
            var p = pads[i]; if (!p || !p.connected) continue;
            var bt = function (n) { return p.buttons[n] && p.buttons[n].pressed; };
            if (bt(0)) agora.a = 1; if (bt(1)) agora.b = 1; if (bt(12)) agora.cima = 1; if (bt(13)) agora.baixo = 1; if (bt(14)) agora.esq = 1; if (bt(15)) agora.dir = 1;
            if (bt(8) && bt(9)) agora.combo = 1; if (bt(16)) agora.home = 1;
            var y = p.axes[1] || 0, x = p.axes[0] || 0; if (y < -0.6) agora.cima = 1; if (y > 0.6) agora.baixo = 1; if (x < -0.6) agora.esq = 1; if (x > 0.6) agora.dir = 1;
        }
        var novo = function (k) { return agora[k] && !antes[k]; };
        if (!iniciado && !saindo && novo('b') && $('#carregando').classList.contains('erro')) sair();
        else if (menuAberto) {
            if (novo('baixo')) { focoMenu = (focoMenu + 1) % OPCOES.length; pintarMenu(); }
            if (novo('cima')) { focoMenu = (focoMenu + OPCOES.length - 1) % OPCOES.length; pintarMenu(); }
            if (OPCOES[focoMenu].id === 'volume' && (novo('esq') || novo('dir'))) mudarVolume(novo('esq') ? -5 : 5);
            if (novo('a')) escolher();
            else if (novo('b') || novo('home')) fecharMenu();
        } else if (iniciado && (novo('combo') || novo('home'))) abrirMenu();
        antes = agora;
        if (!saindo) requestAnimationFrame(lerControle);
    }

    // ------------------------------------------------------------ inicio
    var ETAPAS = [[/Download Game Core/i, 'Baixando o emulador'], [/Decompress Game Core/i, 'Preparando o emulador'],
        [/Download Game Data/i, 'Lendo o jogo'], [/Decompress Game Data/i, 'Abrindo o jogo'], [/Download Game State/i, 'Carregando progresso']];
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

    Retro.rom(id).then(function (r) {
        if (!r) return erro('Jogo não encontrado neste navegador');
        jogo = r;
        var sis = Retro.SISTEMAS[r.sistema];
        document.title = r.nome;
        $('#carNome').textContent = r.nome; $('#menuNome').textContent = r.nome;
        var capa = Retro.capa(r);
        [$('#carCapa'), $('#menuCapa')].forEach(function (img) { img.onerror = function () { img.hidden = true; }; img.src = capa; });
        montarMenu();
        etapa(Retro.codigo() ? 'Buscando seu save na nuvem…' : 'Preparando o emulador…');
        // o .srm precisa estar pronto antes do jogo ligar; o estado (retomar) so depois
        var srmPronto = Retro.carregar(id, 'srm');
        var estadoPronto = Retro.carregar(id, 'state');
        Retro.marcarJogado(id);

        window.EJS_player = '#jogo';
        window.EJS_core = sis.core;
        // File com nome fixo por jogo: o EmulatorJS usa o nome para o arquivo de save
        window.EJS_gameUrl = new File([r.dados], id + (r.ext === '.zip' ? '.zip' : sis.ext));
        window.EJS_gameName = r.nome;
        window.EJS_pathtodata = EMU;
        window.EJS_startOnLoaded = true;
        window.EJS_disableDatabases = true;      // a ROM ja esta no nosso IndexedDB; o core fica no cache do navegador
        window.EJS_threads = false;
        window.EJS_volume = volume / 100;
        window.EJS_color = '#1a8cff';
        window.EJS_backgroundColor = '#000000';
        window.EJS_Buttons = { playPause: false, restart: false, mute: false, settings: false, fullscreen: false, saveState: false,
            loadState: false, screenRecord: false, gamepad: false, cheat: false, volume: false, saveSavFiles: false, loadSavFiles: false,
            quickSave: false, quickLoad: false, screenshot: false, cacheManager: false, exitEmulation: false, netplay: false, diskButton: false,
            contextMenu: false };
        window.EJS_ready = function () {
            // antes do jogo ligar: grava o .srm onde o core vai procurar
            window.EJS_emulator.on('saveDatabaseLoaded', function (FS) {
                return srmPronto.then(function (d) {
                    if (!d) return;
                    var ext = window.EJS_emulator.saveFileExt ? '.' + window.EJS_emulator.saveFileExt : '.srm';
                    try { FS.writeFile('/data/saves/' + id + ext, d); ultimoSrm = assinatura(d); } catch (e) { console.warn('srm', e); }
                });
            });
        };
        window.EJS_onGameStart = function () {
            iniciado = true;
            aplicarVolume();   // EJS_volume = 0 (mudo) seria ignorado
            document.body.classList.add('jogando');
            $('#btnMenu').hidden = false;
            $('#carregando').classList.add('some');
            setTimeout(function () { $('#carregando').hidden = true; }, 400);
            focarJogo();
            var g = gm();
            // confere se o core usou o caminho esperado; se nao, carrega o .srm e reinicia para o jogo le-lo
            srmPronto.then(function (d) {
                if (!d) return;
                var p; try { p = g.getSaveFilePath(); } catch (e) { return; }
                if (p && p.indexOf(id) < 0) { try { g.FS.writeFile(p, d); g.loadSaveFiles(); g.restart(); } catch (e) {} }
            });
            estadoPronto.then(function (st) {
                if (st && st.length) { try { g.loadState(st); aviso('Continuando de onde você parou'); } catch (e) {} }
            });
            // salva a bateria (.srm) a cada 30 s, so se mudou
            setInterval(function () { if (!menuAberto && !saindo) salvarSrm(); }, 30000);
        };
        acompanharCarregamento();
        var s = document.createElement('script');
        s.src = EMU + 'loader.js';
        s.onerror = function () { erro('Não consegui baixar o emulador (sem internet?)'); };
        document.body.appendChild(s);
    }).catch(function () { erro('Não consegui ler o jogo deste navegador'); });

    // aba fechando ou indo para segundo plano (celular): guarda a bateria
    function guardarBateria() {
        if (!iniciado || saindo) return;
        try {
            var d = gm().getSaveFile(), s = d && d.length && assinatura(d);
            if (s && s !== ultimoSrm) { ultimoSrm = s; Retro.salvarAoFechar(id, d); }
        } catch (e) {}
    }
    window.addEventListener('pagehide', guardarBateria);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') guardarBateria(); });
    requestAnimationFrame(lerControle);
})();
