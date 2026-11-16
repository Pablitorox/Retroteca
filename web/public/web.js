/* Biblioteca da versao web: lista as ROMs guardadas neste navegador, adiciona novas e
 * configura o codigo de sincronizacao dos saves. Controle: setas/analogico navegam, A abre. */
(function () {
    'use strict';
    var $ = function (s) { return document.querySelector(s); };

    function aviso(t, ms) {
        var a = $('#aviso'); a.textContent = t; a.classList.add('on');
        clearTimeout(aviso.t); aviso.t = setTimeout(function () { a.classList.remove('on'); }, ms || 2600);
    }

    function cartao(r) {
        var b = document.createElement('button');
        b.className = 'jogo';
        b.innerHTML = '<div class="capa"><span class="tag"></span><img alt="" loading="lazy"><span class="sem" hidden></span>' +
            '<span class="remover" role="button" aria-label="Remover">&times;</span></div><div class="nome"></div><div class="sis"></div>';
        b.querySelector('.tag').textContent = r.sistema.toUpperCase();
        b.querySelector('.nome').textContent = r.nome;
        b.querySelector('.sis').textContent = Retro.SISTEMAS[r.sistema].nome;
        var img = b.querySelector('img'), sem = b.querySelector('.sem');
        sem.textContent = r.nome;
        img.onerror = function () { img.hidden = true; sem.hidden = false; };
        img.src = Retro.capa(r);
        b.addEventListener('click', function (ev) {
            if (ev.target.classList.contains('remover')) {
                ev.stopPropagation();
                if (confirm('Remover "' + r.nome + '" deste navegador? Os saves continuam guardados.')) Retro.remover(r.id).then(montar);
                return;
            }
            location.href = '/jogar.html?id=' + encodeURIComponent(r.id);
        });
        return b;
    }

    function montar() {
        return Retro.listar().then(function (roms) {
            // jogados recentemente primeiro, depois por nome
            roms.sort(function (a, b) { return (b.jogado || 0) - (a.jogado || 0) || a.nome.localeCompare(b.nome); });
            var g = $('#grade'); g.innerHTML = '';
            roms.forEach(function (r) { g.appendChild(cartao(r)); });
            $('#vazio').hidden = roms.length > 0;
            $('#titulo').textContent = roms.length ? 'Jogos (' + roms.length + ')' : 'Jogos';
            var primeiro = g.querySelector('.jogo'); if (primeiro && !document.activeElement.closest('.jogo')) primeiro.focus({ preventScroll: true });
        });
    }

    // patch .bps sozinho: pede a ROM base num segundo seletor
    function pedirBase(patches) {
        // dialogo com botao proprio: o celular so abre o seletor a partir de um toque
        return new Promise(function (ok) {
            var dlg = $('#dlgBase'), inp = $('#base');
            $('#basePatch').textContent = patches[0].name;
            inp.onchange = function () { var f = inp.files && inp.files[0]; inp.value = ''; dlg.close(); ok(f || null); };
            $('#baseCancelar').onclick = function () { dlg.close(); ok(null); };
            dlg.showModal();
        });
    }
    function processar(arqs) {
        var patches = arqs.filter(function (f) { return /\.bps$/i.test(f.name); });
        var roms = arqs.filter(function (f) { return !/\.bps$/i.test(f.name); });
        // patch + ROM escolhidos juntos: a ROM e a base, nao um jogo a mais
        var base = patches.length && roms.length ? Promise.resolve(roms.shift()) : patches.length ? pedirBase(patches) : Promise.resolve(null);
        return base.then(function (b) {
            if (patches.length && !b) return Promise.resolve({ ok: 0, erros: ['Sem a ROM base não dá para aplicar o patch'] });
            var tarefas = patches.map(function (p) { return function () { return Retro.adicionarComPatch(p, b); }; })
                .concat(roms.map(function (f) { return function () { return Retro.adicionar(f); }; }));
            aviso(patches.length ? 'Aplicando o patch…' : 'Adicionando ' + tarefas.length + ' jogo(s)…', 30000);
            var ok = 0, erros = [];
            return tarefas.reduce(function (p, t) {
                return p.then(function () { return t().then(function () { ok++; }, function (e) { erros.push(e.message); }); });
            }, Promise.resolve()).then(function () { return { ok: ok, erros: erros }; });
        });
    }

    $('#arquivos').addEventListener('change', function (ev) {
        var arqs = Array.prototype.slice.call(ev.target.files || []);
        ev.target.value = '';
        if (!arqs.length) return;
        processar(arqs).then(function (r) {
            var ok = r.ok, erros = r.erros;
            montar();
            aviso(erros.length ? (ok ? ok + ' adicionado(s). ' : '') + erros[0] : ok + ' jogo(s) adicionado(s)', erros.length ? 6000 : 2600);
        });
    });

    // ------------------------------------------------------------ nuvem
    function pintarNuvem() {
        var on = !!Retro.codigo();
        $('#btnNuvem').classList.toggle('on', on);
        $('#nuvemTxt').textContent = on ? 'Sincronizando' : 'Nuvem';
    }
    $('#btnNuvem').addEventListener('click', function () { $('#codigo').value = Retro.codigo(); $('#dlgNuvem').showModal(); });
    $('#dlgNuvem').addEventListener('close', function () {
        var v = $('#dlgNuvem').returnValue, c = $('#codigo').value.trim();
        if (v === 'limpar') { Retro.definirCodigo(''); aviso('Saves só neste navegador'); }
        else if (v === 'ok') {
            if (c.length < 8) { aviso('O código precisa ter pelo menos 8 caracteres'); return; }
            Retro.definirCodigo(c); aviso('Saves sincronizando com a nuvem');
        }
        pintarNuvem();
    });

    // ------------------------------------------------------------ controle (grade)
    function mover(dx, dy) {
        var itens = Array.prototype.slice.call(document.querySelectorAll('.jogo'));
        if (!itens.length) return;
        var i = itens.indexOf(document.activeElement);
        if (i < 0) return itens[0].focus();
        var cols = getComputedStyle($('#grade')).gridTemplateColumns.split(' ').length;
        var n = Math.max(0, Math.min(itens.length - 1, i + dx + dy * cols));
        itens[n].focus(); itens[n].scrollIntoView({ block: 'nearest' });
    }
    var antes = {};
    function lerControle() {
        var pads = navigator.getGamepads ? navigator.getGamepads() : [], agora = {};
        for (var i = 0; i < pads.length; i++) {
            var p = pads[i]; if (!p || !p.connected) continue;
            var bt = function (n) { return p.buttons[n] && p.buttons[n].pressed; };
            var x = p.axes[0] || 0, y = p.axes[1] || 0;
            if (bt(0)) agora.a = 1;
            if (bt(12) || y < -0.6) agora.cima = 1; if (bt(13) || y > 0.6) agora.baixo = 1;
            if (bt(14) || x < -0.6) agora.esq = 1; if (bt(15) || x > 0.6) agora.dir = 1;
        }
        var novo = function (k) { return agora[k] && !antes[k]; };
        if (!$('#dlgNuvem').open) {
            if (novo('esq')) mover(-1, 0); if (novo('dir')) mover(1, 0);
            if (novo('cima')) mover(0, -1); if (novo('baixo')) mover(0, 1);
            if (novo('a') && document.activeElement.classList.contains('jogo')) document.activeElement.click();
        }
        antes = agora;
        requestAnimationFrame(lerControle);
    }
    window.addEventListener('keydown', function (ev) {
        if ($('#dlgNuvem').open || ev.target.tagName === 'INPUT') return;
        var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
        if (d) { ev.preventDefault(); mover(d[0], d[1]); }
    });

    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();   // pede para o navegador nao apagar as ROMs
    pintarNuvem();
    montar();
    requestAnimationFrame(lerControle);
})();
