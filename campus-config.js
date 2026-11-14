/* =====================================================================
   CAMPUS CAPACITACIÓN MARTIN — campus-config.js
   Conecta la página con la hoja maestra (Google Sheets + Apps Script).
   - Datos: claves (cifradas), frases, enlaces, calculadoras, textos, avisos.
   - Temas festivos: animaciones, gorro del logo, decoración del banner.
   - Panel master: tocar 7 veces el logo (o Ctrl+Shift+M, o #master).
   Si la hoja no responde, la página sigue funcionando con sus datos locales.
   Versión 2: el Panel master edita claves, frases, botones, secciones, calculadoras,
   contactos, avisos, temas, textos, música e imágenes (requiere Code.gs v2).
   ===================================================================== */
(function () {
  'use strict';

  /* >>>>>> PEGA AQUÍ la URL de tu app web (termina en /exec) <<<<<< */
  var API_URL = 'https://script.google.com/macros/s/AKfycbwnjOEtRnbtx8Z5C7A6GcuBcnUvotPCiwAFOXRzmLF-hQT7xeGflLweUx9gZMR-9cWS/exec';

  var SAL = 'martin-campus-2026';              // igual que en Code.gs y en el HTML
  var CACHE_KEY = 'campus_cache_v1';
  var PREV_KEY = 'campus_preview_v1';
  var FX_KEY = 'campus_fx_user';

  var DATA = null, hooks = null, ORIG = null, claveMaster = '';
  var hasDOM = typeof document !== 'undefined';

  /* ------------------------- utilidades ------------------------- */
  function si(v, def) {
    if (v === undefined || v === null || v === '') return !!def;
    return /^(si|sí|s|true|1|x)$/i.test(String(v).trim());
  }
  function num(v, d) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? d : n; }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function urlSegura(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:\/\/|\.{0,2}\/|[\w-]+\.html?(\?|#|$))/i.test(u)) return esc(u);
    return '';
  }
  function colorOk(c) { return /^#[0-9a-f]{3,8}$/i.test(String(c || '').trim()) ? String(c).trim() : ''; }
  function porOrden(a, b) { return num(a.orden, 999) - num(b.orden, 999); }

  /* ------------------------- fechas y reglas ------------------------- */
  // "MM-DD"  |  "nD-MM" (n-ésimo domingo del mes)  |  "nD-MM:+k" / ":-k" (desfase en días)
  function parseRegla(txt, anio) {
    txt = String(txt || '').trim();
    if (!txt) return null;
    var m = txt.match(/^(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(anio, +m[1] - 1, +m[2]);
    m = txt.match(/^(\d)D-(\d{1,2})(?::([+-]?\d+))?$/i);
    if (m) {
      var n = +m[1], mes = +m[2] - 1, off = +(m[3] || 0);
      var first = new Date(anio, mes, 1);
      var delta = (7 - first.getDay()) % 7;
      return new Date(anio, mes, 1 + delta + (n - 1) * 7 + off);
    }
    return null;
  }
  function dia0(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function enRango(t, hoy) {
    var y = hoy.getFullYear();
    var ini = parseRegla(t.inicio, y), fin = parseRegla(t.fin, y);
    if (!ini || !fin) return false;
    var h = dia0(hoy);
    if (ini <= fin) return h >= ini && h <= fin;
    return h >= ini || h <= fin;              // cruza el año (ej. 12-27 a 01-03)
  }
  function temaDeFecha(temas, hoy) {
    var mejor = null;
    (temas || []).forEach(function (t) {
      if (!si(t.activo, true) || !enRango(t, hoy)) return;
      if (!mejor || num(t.prioridad, 1) > num(mejor.prioridad, 1)) mejor = t;
    });
    return mejor;
  }
  function diaDelAnio(hoy) {
    return Math.floor((dia0(hoy) - new Date(hoy.getFullYear(), 0, 0)) / 86400000);
  }
  function mmdd(hoy) {
    return ('0' + (hoy.getMonth() + 1)).slice(-2) + '-' + ('0' + hoy.getDate()).slice(-2);
  }

  /* ------------------------- tema activo ------------------------- */
  function leerPrev() {
    if (!hasDOM) return null;
    try { return JSON.parse(localStorage.getItem(PREV_KEY) || 'null'); } catch (e) { return null; }
  }
  function resolverTema(d, hoy) {
    var cfg = d.config || {};
    var prev = leerPrev();
    var temas = d.temas || [];
    function porId(id) { return temas.filter(function (t) { return t.id === id; })[0] || null; }
    if (prev) return prev.tema ? porId(prev.tema) : null;
    var modo = String(cfg.modo_tema || 'auto').toLowerCase();
    if (modo === 'ninguno') return null;
    if (modo === 'manual') return porId(cfg.tema_manual);
    return temaDeFecha(temas, hoy);
  }
  function animacionesOn(d) {
    var cfg = d.config || {};
    var prev = leerPrev();
    var on = si(cfg.animaciones, true);
    if (prev && prev.anim !== undefined) on = !!prev.anim;
    return on;
  }
  function intensidad(d) {
    var prev = leerPrev();
    if (prev && prev.intensidad) return num(prev.intensidad, 100);
    return num((d.config || {}).intensidad, 100);
  }

  /* ------------------------- frase del día ------------------------- */
  function frases(d, tema, hoy) {
    var lista = (d.frases || []).filter(function (f) { return si(f.activa, true) && f.frase; });
    var hoyKey = mmdd(hoy);
    var fija = lista.filter(function (f) { return f.fecha && f.fecha === hoyKey; });
    var id = tema ? tema.id : '';
    var delTema = id ? lista.filter(function (f) { return f.tema === id; }) : [];
    var generales = lista.filter(function (f) { return !f.tema || f.tema === 'todos'; });
    var pool = delTema.length ? delTema.concat(generales) : generales;
    if (!pool.length) pool = lista;
    var pick = '';
    if (fija.length) pick = fija[0].frase;
    else if (pool.length) {
      // Si el tema tiene frases propias, se rotan entre ellas; si no, entre las generales
      var base = delTema.length ? delTema : pool;
      pick = base[diaDelAnio(hoy) % base.length].frase;
    }
    return { pool: pool.map(function (f) { return f.frase; }), dia: pick };
  }

  /* ------------------------- construir datos para el HTML ------------------------- */
  function item(r) {
    var o = { t: esc(r.texto), k: r.icono || 'file', u: urlSegura(r.url) };
    if (si(r.clave, false)) o.pw = 1;
    var f = parseInt(r.destacado, 10);
    if (f === 1 || f === 2) o.f = f;
    if (r.abre === 'calc' || r.abre === 'mas') { o.o = r.abre; o.u = ''; delete o.pw; }
    return o;
  }
  function build(d, tema, hoy) {
    var cfg = d.config || {};
    var out = {};
    var en = (d.enlaces || []).filter(function (r) { return si(r.activo, true) && r.texto; }).sort(porOrden);

    out.TIENDA = en.filter(function (r) { return r.seccion === 'tienda'; }).map(item);

    var secs = (d.secciones || []).filter(function (s) { return si(s.activo, true); }).sort(porOrden);
    out.SEC = {}; out.HOME = []; out.INFER = [];
    secs.forEach(function (s) {
      var o = { t: esc(s.titulo), d: esc(s.descripcion), k: s.icono || 'file', p: Math.max(0, Math.min(5, parseInt(s.paleta, 10) || 0)), g: [] };
      var u = urlSegura(s.url); if (u) o.u = u;
      if (s.descripcion_inicio) o.dh = esc(s.descripcion_inicio);
      var grupos = [], idx = {};
      en.filter(function (r) { return r.seccion === s.id; }).forEach(function (r) {
        var h = r.grupo || '';
        if (!(h in idx)) { idx[h] = grupos.length; grupos.push(h ? { h: esc(h), i: [] } : { i: [] }); }
        grupos[idx[h]].i.push(item(r));
      });
      o.g = grupos;
      out.SEC[s.id] = o;
      if (s.ubicacion === 'inicio') out.HOME.push(s.id);
      else if (s.ubicacion === 'inferior') out.INFER.push(s.id);
    });

    var cal = (d.calculadoras || []).filter(function (c) { return si(c.activo, true) && c.nombre; }).sort(porOrden);
    var PAL = ['#00a047', '#8a3fe0', '#1e63e0', '#19b5f0', '#e02020', '#8b5a3c', '#e0189b', '#14b8a6', '#f07d00', '#ff7eb6', '#f5c400'];
    out.CALC = cal.map(function (c) { return [esc(c.nombre), esc(c.imagen_url || ''), urlSegura(c.url)]; });
    out.CCOL = cal.map(function (c, n) { return colorOk(c.color) || PAL[n % PAL.length]; });
    out.CALC_PIE = esc(cfg.calc_pie || '');
    out.CONTACTOS = (d.contactos || []).filter(function (c) { return si(c.activo, true) && c.nombre; }).sort(porOrden)
      .map(function (c) { return [esc(c.nombre), esc(c.detalle || 'Escribir por WhatsApp'), urlSegura(c.url)]; });
    out.MAS_TXT = [esc(cfg.mas_texto_1 || ''), esc(cfg.mas_texto_2 || '')];

    var fr = frases(d, tema, hoy);
    out.MENSAJES = fr.pool; out.FRASE_DIA = fr.dia;
    out.MODO_FRASE = String(cfg.frase_modo || 'dia').toLowerCase() === 'aleatoria' ? 'aleatoria' : 'dia';

    out.PIN_H = cfg.pin_hash || '';
    out.CLAVE_H = cfg.clave_simuladores_hash || '';
    out.MUSICA = (tema && tema.musica_url) || cfg.musica_url || '';
    var v = num(cfg.volumen_inicial, NaN); out.VOL = isNaN(v) ? null : Math.max(0, Math.min(1, v));
    return out;
  }

  /* ------------------------- SHA-256 (misma fórmula que Code.gs) ------------------------- */
  function sha(s) {
    var enc = new TextEncoder().encode(SAL + ':' + s);
    return crypto.subtle.digest('SHA-256', enc).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }

  /* =====================================================================
     DE AQUÍ PARA ABAJO SOLO SE EJECUTA EN EL NAVEGADOR
     ===================================================================== */
  var CSS = [
    '#campus-fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60}',
    '.campus-logo{position:relative;display:inline-block;line-height:0;flex:none}',
    '.gcard .campus-logo{display:block;width:fit-content;margin:0 auto 18px}.gcard .campus-logo img{margin:0!important}',
    '.campus-hat{position:absolute;pointer-events:none;z-index:2;transform-origin:50% 100%;filter:drop-shadow(0 2px 2px rgba(0,0,0,.25))}',
    '.campus-hat svg,.campus-hat img{height:100%;width:auto;display:block}',
    '.campus-deco{position:absolute;left:0;right:0;top:0;height:60px;pointer-events:none;z-index:1;overflow:hidden}',
    '.campus-deco svg{width:100%;height:100%;display:block}',
    '@keyframes campus-tw{0%,100%{opacity:1}50%{opacity:.3}}',
    '.campus-bulb{animation:campus-tw 1.8s ease-in-out infinite}',
    '#campus-aviso{display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 44px 8px 16px;color:#fff;font:600 .85rem/1.35 var(--f,system-ui);text-align:center;position:relative}',
    '#campus-aviso a{color:#fff;text-decoration:underline}',
    '#campus-aviso button{position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:rgba(255,255,255,.25);color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer}',
    '#campus-fxbtn{position:fixed;left:14px;bottom:calc(92px + env(safe-area-inset-bottom,0px));z-index:61;width:40px;height:40px;border-radius:50%;border:1.5px solid var(--bd,#e0e7e1);background:var(--card,#fff);color:var(--o,#f07d00);cursor:pointer;display:none;place-items:center;box-shadow:0 8px 18px -8px rgba(0,0,0,.35);font-size:18px}',
    '#campus-fxbtn.off{opacity:.55}',
    '@media(min-width:1024px){#campus-fxbtn{bottom:28px;left:28px}}',
    '#campus-prev{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:350;background:#222;color:#fff;padding:8px 14px;border-radius:999px;font:600 .8rem var(--f,system-ui);display:flex;gap:10px;align-items:center;box-shadow:0 8px 20px rgba(0,0,0,.35)}',
    '#campus-prev button{border:0;border-radius:999px;background:var(--o,#f07d00);color:#fff;padding:4px 10px;font:700 .75rem var(--f,system-ui);cursor:pointer}',
    '#campus-mant{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:24px;text-align:center;color:#fff;background:linear-gradient(135deg,var(--gd,#06502a),var(--g,#00963f));font-family:var(--f,system-ui)}',
    '#campus-mant h2{margin:0 0 10px;font-size:1.6rem}#campus-mant p{margin:0;opacity:.92;max-width:440px}',
    '#campus-master{position:fixed;inset:0;z-index:400;display:grid;place-items:center;padding:16px;background:rgba(3,30,16,.62);backdrop-filter:blur(4px);font-family:var(--f,system-ui)}',
    '.cm-box{width:100%;max-width:520px;max-height:92vh;overflow:auto;background:var(--card,#fff);color:var(--tx,#17261d);border-radius:20px;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)}',
    '.cm-h{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--o,#f07d00);color:#fff;border-radius:20px 20px 0 0;position:sticky;top:0}',
    '.cm-h b{font-size:1.05rem}.cm-x{border:0;background:rgba(255,255,255,.25);color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer}',
    '.cm-b{padding:16px 18px 20px;display:grid;gap:10px}',
    '.cm-b label{font-size:.78rem;font-weight:700;color:var(--mu,#66756b)}',
    '.cm-b select,.cm-b input[type=text],.cm-b input[type=password],.cm-b textarea{width:100%;box-sizing:border-box;padding:9px 11px;border:1.5px solid var(--bd,#e0e7e1);border-radius:10px;background:var(--bg,#fff);color:var(--tx,#17261d);font:500 .9rem var(--f,system-ui)}',
    '.cm-b h4{margin:6px 0 0;font-size:.85rem;color:var(--g,#00963f);text-transform:uppercase;letter-spacing:.06em}',
    '.cm-row{display:flex;gap:8px;flex-wrap:wrap}',
    '.cm-b button.cm-btn{flex:1;min-width:120px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--bd,#e0e7e1);background:var(--card,#fff);color:var(--tx,#17261d);font:700 .82rem var(--f,system-ui);cursor:pointer}',
    '.cm-b button.cm-pri{background:var(--o,#f07d00);border-color:var(--o,#f07d00);color:#fff}',
    '.cm-st{margin:0;padding:9px 11px;border-radius:10px;background:rgba(0,150,63,.1);font-size:.82rem}',
    '.cm-msg{min-height:1.2em;font-size:.8rem;font-weight:600}.cm-msg.err{color:#d12a2a}.cm-msg.ok{color:#0a8a3e}',
    '.cm-sw{display:flex;align-items:center;gap:8px;color:var(--tx,#17261d)!important;font-size:.9rem!important}',
    '.cm-d{border:1.5px solid var(--bd,#e0e7e1);border-radius:12px;overflow:hidden}',
    '.cm-d>summary{cursor:pointer;padding:11px 14px;font:700 .88rem var(--f,system-ui);background:rgba(0,150,63,.07);list-style:none}',
    '.cm-d>summary::-webkit-details-marker{display:none}.cm-d>summary::before{content:"▸";display:inline-block;margin-right:8px;transition:transform .15s}',
    '.cm-d[open]>summary::before{transform:rotate(90deg)}',
    '.cm-dc{padding:12px 14px 14px;display:grid;gap:8px}',
    '.cm-h2{display:block;font-size:.72rem;color:var(--mu,#66756b);line-height:1.3;margin-top:-4px}',
    '.cm-r{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1.5px solid var(--bd,#e0e7e1);border-radius:10px}',
    '.cm-r.off{opacity:.5}.cm-rt{min-width:0;flex:1}.cm-rt b{display:block;font-size:.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis}',
    '.cm-rt small{display:block;font-size:.7rem;color:var(--mu,#66756b)}',
    '.cm-ra{display:flex;gap:4px;flex:none}.cm-ra button{border:1.5px solid var(--bd,#e0e7e1);background:var(--card,#fff);color:var(--tx,#17261d);border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:.85rem}',
    '.cm-form{display:grid;gap:8px;padding:12px;border:1.5px solid var(--o,#f07d00);border-radius:12px}',
    '.cm-bar{position:sticky;bottom:0;background:var(--card,#fff);border-top:1px solid var(--bd,#e0e7e1);padding:8px 18px;border-radius:0 0 20px 20px}',
    '.cm-bar .cm-msg{min-height:1.3em}'
  ].join('\n');

  function $(id) { return document.getElementById(id); }
  function inyectarCSS() {
    if ($('campus-css')) return;
    var s = document.createElement('style'); s.id = 'campus-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  /* ------------------------- textos del sitio ------------------------- */
  function guardarOriginales() {
    if (ORIG) return;
    var h = document.querySelector('header img'), hi = document.querySelector('.hero-img');
    var tag = document.querySelector('.hero-tag'), hero = document.querySelector('.hero');
    ORIG = {
      logo: h ? h.src : '', heroImg: hi ? hi.src : '',
      tagBg: tag ? tag.style.background : '', hero: hero ? hero.style.background : ''
    };
  }
  function setTxt(sel, txt) { var el = document.querySelector(sel); if (el && txt) el.textContent = txt; }
  function aplicarTextos(d) {
    var c = d.config || {};
    setTxt('.hero h2', c.hero_titulo);
    setTxt('.hero > .hero-in > p', c.hero_subtitulo);
    setTxt('#gt', c.gate_titulo);
    setTxt('#gf p', c.gate_texto);
    var t1 = document.querySelector('#home > .ttl:nth-child(1)'), t2 = document.querySelector('#home > .ttl:nth-child(3)');
    if (t1 && c.titulo_tienda && t1.firstChild) t1.firstChild.nodeValue = c.titulo_tienda;
    if (t2 && c.titulo_formacion && t2.firstChild) t2.firstChild.nodeValue = c.titulo_formacion;
    var f = document.querySelector('footer');
    if (f && (c.footer_titulo || c.footer_sedes)) {
      f.textContent = '';
      var b = document.createElement('b'); b.textContent = c.footer_titulo || ''; f.appendChild(b);
      f.appendChild(document.createElement('br')); f.appendChild(document.createTextNode(c.footer_sedes || ''));
    }
    // Menú superior: usa el título y el enlace de las Secciones (así no queda fijo en el HTML)
    var sec = {}; (d.secciones || []).forEach(function (s) { sec[s.id] = s; });
    function navTxt(btn, txt) {
      if (!btn || !txt) return;
      for (var i = btn.childNodes.length - 1; i >= 0; i--) {
        var n = btn.childNodes[i];
        if (n.nodeType === 3 && n.nodeValue.trim()) { if (n.nodeValue.trim().toLowerCase() !== String(txt).toLowerCase()) n.nodeValue = txt; return; }
      }
    }
    if (sec.ingreso) navTxt(document.querySelector('header nav button[data-open="ingreso"]'), sec.ingreso.titulo);
    if (sec.escuela) navTxt(document.querySelector('header nav button[data-open="escuela"]'), sec.escuela.titulo);
    if (sec.eval) {
      var be = document.querySelector('header nav button[data-u]');
      if (be) { navTxt(be, sec.eval.titulo); var ue = urlSegura(sec.eval.url); if (ue) be.setAttribute('data-u', sec.eval.url); }
    }
    // Logo alternativo
    if (c.logo_imagen_url) {
      var imgs = document.querySelectorAll('header img, #gf img, #gf .campus-logo img');
      Array.prototype.forEach.call(imgs, function (i) { if (i.src !== c.logo_imagen_url) i.src = c.logo_imagen_url; });
    }
  }

  /* ------------------------- aviso y mantenimiento ------------------------- */
  function aviso(d, hoy) {
    var viejo = $('campus-aviso'); if (viejo) viejo.remove();
    var a = (d.avisos || []).filter(function (x) { return si(x.activo, false) && x.texto && enRango(x, hoy); })[0];
    if (!a) return;
    try { if (sessionStorage.getItem('aviso_' + a.id) === '1') return; } catch (e) {}
    var div = document.createElement('div'); div.id = 'campus-aviso';
    div.style.background = colorOk(a.color) || '#f07d00';
    div.appendChild(document.createTextNode(a.texto + ' '));
    var u = urlSegura(a.enlace);
    if (u) { var l = document.createElement('a'); l.href = a.enlace; l.target = '_blank'; l.rel = 'noopener'; l.textContent = 'Ver más'; div.appendChild(l); }
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar aviso'); x.textContent = '✕';
    x.onclick = function () { try { sessionStorage.setItem('aviso_' + a.id, '1'); } catch (e) {} div.remove(); };
    div.appendChild(x);
    var h = document.querySelector('header'); if (h) h.insertAdjacentElement('afterend', div);
  }
  function mantenimiento(d) {
    var viejo = $('campus-mant'); if (viejo) viejo.remove();
    var master = false; try { master = sessionStorage.getItem('campus_master') === '1'; } catch (e) {}
    if (!si((d.config || {}).mantenimiento, false) || master || location.hash === '#master') return;
    var div = document.createElement('div'); div.id = 'campus-mant';
    var box = document.createElement('div');
    var h = document.createElement('h2'); h.textContent = 'Campus en mantenimiento';
    var p = document.createElement('p'); p.textContent = d.config.mantenimiento_mensaje || 'Estamos mejorando el campus. Vuelve en unos minutos.';
    box.appendChild(h); box.appendChild(p); div.appendChild(box); document.body.appendChild(div);
  }

  /* ------------------------- gorros ------------------------- */
  var HATS = {
    santa: '<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M14 76C14 40 38 10 72 12c20 1 34 12 38 32L96 76z" fill="#d7263d"/>' +
      '<path d="M72 12c20 1 34 12 38 32L96 76H84c12-20 8-46-12-64z" fill="#a8142b" opacity=".55"/>' +
      '<circle cx="110" cy="46" r="12" fill="#fff" stroke="#cfd6d1" stroke-width="2"/>' +
      '<rect x="6" y="68" width="96" height="26" rx="13" fill="#fff" stroke="#cfd6d1" stroke-width="2"/></svg>',
    bruja: '<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M62 4c4 10 14 14 20 14-6 4-10 8-12 14-4 14 6 30 16 38H30c10-8 20-24 20-40 0-12 8-18 12-26z" fill="#3b1a63"/>' +
      '<path d="M40 56h40l4 10H36z" fill="#f07d00"/><rect x="55" y="57" width="10" height="8" rx="1" fill="#ffd166"/>' +
      '<ellipse cx="60" cy="76" rx="54" ry="12" fill="#2a1048"/></svg>'
  };
  function envolverLogo(img) {
    if (!img) return null;
    var p = img.parentElement;
    if (p && p.classList.contains('campus-logo')) return p;
    var w = document.createElement('span'); w.className = 'campus-logo';
    img.parentNode.insertBefore(w, img); w.appendChild(img);
    return w;
  }
  function quitarGorros() {
    Array.prototype.forEach.call(document.querySelectorAll('.campus-hat'), function (n) { n.remove(); });
  }
  function ponerGorro(tema) {
    quitarGorros();
    if (!tema) return;
    var g = String(tema.gorro || '').trim();
    if (!g || /^ning/i.test(g)) return;
    var logos = [document.querySelector('header img'), document.querySelector('#gf img')];
    logos.forEach(function (img, n) {
      var w = envolverLogo(img); if (!w) return;
      var hat = document.createElement('span'); hat.className = 'campus-hat';
      var gate = n === 1;
      var x = num(tema.gorro_x, -3), y = num(tema.gorro_y, -40), alto = num(tema.gorro_alto, 75), giro = num(tema.gorro_giro, -12);
      hat.style.cssText = 'left:' + x + '%;top:' + y + '%;height:' + alto + '%;transform:rotate(' + giro + 'deg)';
      if (HATS[g.toLowerCase()]) hat.innerHTML = HATS[g.toLowerCase()];
      else if (tema.gorro_url) { var i = document.createElement('img'); i.src = tema.gorro_url; i.alt = ''; i.referrerPolicy = 'no-referrer'; hat.appendChild(i); }
      else return;
      w.appendChild(hat);
    });
  }

  /* ------------------------- decoración del banner ------------------------- */
  var decoResize = null;
  function quitarDeco() {
    Array.prototype.forEach.call(document.querySelectorAll('.campus-deco'), function (n) { n.remove(); });
    if (decoResize) { removeEventListener('resize', decoResize); decoResize = null; }
  }
  function pintarDeco(div, tipo, cols) {
    var W = Math.max(320, div.clientWidth || innerWidth), seg = 170, sag = 18, h = 60;
    var svg = ['<svg viewBox="0 0 ' + W + ' ' + h + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'];
    var nseg = Math.ceil(W / seg), anchoSeg = W / nseg, k = 0;
    for (var s = 0; s < nseg; s++) {
      var x0 = s * anchoSeg, x2 = x0 + anchoSeg, x1 = (x0 + x2) / 2, y0 = 3, y1 = 3 + 2 * sag;
      svg.push('<path d="M' + x0 + ' ' + y0 + ' Q' + x1 + ' ' + y1 + ' ' + x2 + ' ' + y0 + '" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1.6"/>');
      var nb = tipo === 'banderines' ? 6 : 5;
      for (var i = 1; i <= nb; i++) {
        var t = i / (nb + 1), px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * x1 + t * t * x2, py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * y1 + t * t * y0;
        var c = cols[k % cols.length]; k++;
        if (tipo === 'banderines') {
          svg.push('<path d="M' + (px - 11) + ' ' + py + 'L' + (px + 11) + ' ' + py + 'L' + px + ' ' + (py + 26) + 'Z" fill="' + c + '" stroke="rgba(0,0,0,.25)" stroke-width="1"/>');
        } else {
          svg.push('<g class="campus-bulb" style="animation-delay:' + ((k % 7) * 0.25).toFixed(2) + 's"><circle cx="' + px + '" cy="' + (py + 6) + '" r="9" fill="' + c + '" opacity=".25"/><ellipse cx="' + px + '" cy="' + (py + 6) + '" rx="4" ry="5.5" fill="' + c + '"/></g>');
        }
      }
    }
    svg.push('</svg>'); div.innerHTML = svg.join('');
  }
  function ponerDeco(tema, cols) {
    quitarDeco();
    var tipo = tema ? String(tema.decoracion || '').toLowerCase() : '';
    if (tipo !== 'luces' && tipo !== 'banderines') return;
    var hero = document.querySelector('.hero'); if (!hero) return;
    var div = document.createElement('div'); div.className = 'campus-deco'; hero.appendChild(div);
    var pal = cols.length ? cols : (tipo === 'luces' ? ['#ff3b3b', '#ffd23b', '#3bd16f', '#3b9bff'] : ['#d91023', '#ffffff']);
    pintarDeco(div, tipo, pal);
    var tm; decoResize = function () { clearTimeout(tm); tm = setTimeout(function () { pintarDeco(div, tipo, pal); }, 200); };
    addEventListener('resize', decoResize);
  }

  /* ------------------------- banner: etiqueta, imagen, degradado ------------------------- */
  function aplicarBanner(d, tema) {
    var c = d.config || {};
    var tag = document.querySelector('.hero-tag'), hero = document.querySelector('.hero'), img = document.querySelector('.hero-img');
    if (tag) {
      var txt = (tema && tema.etiqueta_hero) || c.hero_etiqueta;
      if (txt) tag.textContent = txt;
      tag.style.background = (tema && colorOk(tema.color_etiqueta)) || ORIG.tagBg || '';
    }
    if (hero) {
      var c1 = tema && colorOk(tema.banner_color_1), c2 = tema && colorOk(tema.banner_color_2);
      hero.style.background = (c1 && c2) ? 'linear-gradient(120deg,' + c1 + ' 0%,' + c2 + ' 100%)' : (ORIG.hero || '');
    }
    var url = (tema && tema.hero_imagen_url) || c.hero_imagen_url;
    if (img && url && img.getAttribute('src') !== url) { img.src = url; }
  }

  /* ------------------------- motor de partículas ------------------------- */
  var Motor = (function () {
    var cv, cx, W = 0, H = 0, dpr = 1, parts = [], raf = 0, cfg = null, t0 = 0, last = 0, frames = 0, acc = 0, nivel = 0, sprite = null;

    function crear() {
      if (cv) return;
      cv = document.createElement('canvas'); cv.id = 'campus-fx'; cv.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cv); cx = cv.getContext('2d');
      addEventListener('resize', ajustar); ajustar();
    }
    function ajustar() {
      dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function soft() {
      if (sprite) return sprite;
      sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
      var g = sprite.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return sprite;
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function pick(a) { return a[(Math.random() * a.length) | 0]; }

    function nueva(tipo, inicial) {
      var v = cfg.vel, c = pick(cfg.cols);
      var p = { tipo: tipo, c: c, ph: rnd(0, 6.283), x: rnd(0, W), y: inicial ? rnd(0, H) : -30 };
      switch (tipo) {
        case 'nieve':
          p.r = 1.2 + Math.pow(Math.random(), 2) * 4; p.vy = (14 + p.r * 11) * v; p.amp = rnd(8, 26); p.f = rnd(.4, 1); p.a = .35 + .55 * (p.r / 5.2); p.bx = p.x; break;
        case 'corazones':
          p.s = rnd(9, 22); p.vy = -rnd(30, 70) * v; p.amp = rnd(10, 30); p.f = rnd(.5, 1.1); p.a = rnd(.45, .9); p.bx = p.x; p.rot = rnd(-.4, .4);
          if (!inicial) p.y = H + 30; break;
        case 'confeti': case 'papelitos':
          p.w = rnd(5, 11); p.h = rnd(3, 6); p.vy = rnd(50, 110) * v; p.amp = rnd(10, 28); p.f = rnd(.6, 1.4); p.rot = rnd(0, 6.283); p.vr = rnd(-3, 3); p.bx = p.x; p.a = .95; break;
        case 'petalos':
          p.s = rnd(6, 13); p.vy = rnd(22, 55) * v; p.amp = rnd(20, 44); p.f = rnd(.4, .9); p.rot = rnd(0, 6.283); p.vr = rnd(-1.4, 1.4); p.bx = p.x; p.a = rnd(.6, .95); break;
        case 'murcielagos':
          p.s = rnd(.5, 1.15); p.dir = Math.random() < .5 ? 1 : -1; p.vx = rnd(40, 95) * v * p.dir; p.y = rnd(70, H * .65); p.base = p.y; p.fl = rnd(9, 14); p.amp = rnd(18, 46); p.f = rnd(.6, 1.3);
          p.x = inicial ? rnd(0, W) : (p.dir > 0 ? -60 : W + 60); p.a = .9; break;
        case 'estrellas':
          p.s = rnd(3, 9); p.f = rnd(.8, 2.2); p.vy = rnd(-4, 4) * v; p.a = 1; p.y = rnd(0, H); break;
      }
      return p;
    }
    function heart(x, y, s) {
      cx.beginPath(); cx.moveTo(x, y + s * .35);
      cx.bezierCurveTo(x, y - s * .15, x - s * .55, y - s * .15, x - s * .55, y + s * .2);
      cx.bezierCurveTo(x - s * .55, y + s * .55, x - s * .1, y + s * .75, x, y + s);
      cx.bezierCurveTo(x + s * .1, y + s * .75, x + s * .55, y + s * .55, x + s * .55, y + s * .2);
      cx.bezierCurveTo(x + s * .55, y - s * .15, x, y - s * .15, x, y + s * .35); cx.closePath(); cx.fill();
    }
    function bat(p, t) {
      var a = Math.sin(t * p.fl + p.ph) * .75, s = 14 * p.s;
      cx.save(); cx.translate(p.x, p.y); cx.scale(p.dir > 0 ? 1 : -1, 1); cx.fillStyle = p.c; cx.globalAlpha = p.a;
      cx.beginPath(); cx.ellipse(0, 0, s * .38, s * .55, 0, 0, 6.283); cx.fill();
      cx.beginPath(); cx.moveTo(-s * .12, -s * .5); cx.lineTo(-s * .04, -s * .85); cx.lineTo(s * .02, -s * .5); cx.fill();
      for (var k = -1; k <= 1; k += 2) {
        cx.save(); cx.scale(k, 1); cx.rotate(-a * .6);
        cx.beginPath(); cx.moveTo(s * .2, -s * .1);
        cx.quadraticCurveTo(s * 1.0, -s * (.9 + a * .5), s * 1.75, -s * (.25 + a * .6));
        cx.quadraticCurveTo(s * 1.45, -s * .1, s * 1.35, s * .2);
        cx.quadraticCurveTo(s * 1.1, s * .02, s * .85, s * .3);
        cx.quadraticCurveTo(s * .6, s * .1, s * .2, s * .35); cx.closePath(); cx.fill(); cx.restore();
      }
      cx.restore();
    }
    function paso(p, dt, t) {
      switch (p.tipo) {
        case 'nieve': case 'confeti': case 'papelitos': case 'petalos':
          p.y += p.vy * dt; p.x = p.bx + Math.sin(t * p.f + p.ph) * p.amp;
          if (p.vr) p.rot += p.vr * dt; if (p.y > H + 30) { p.y = -30; p.bx = rnd(0, W); } break;
        case 'corazones':
          p.y += p.vy * dt; p.x = p.bx + Math.sin(t * p.f + p.ph) * p.amp; if (p.y < -40) { p.y = H + 30; p.bx = rnd(0, W); } break;
        case 'murcielagos':
          p.x += p.vx * dt; p.y = p.base + Math.sin(t * p.f + p.ph) * p.amp;
          if ((p.dir > 0 && p.x > W + 80) || (p.dir < 0 && p.x < -80)) { p.x = p.dir > 0 ? -70 : W + 70; p.base = rnd(70, H * .65); } break;
        case 'estrellas':
          p.y += p.vy * dt; if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10; break;
      }
    }
    function dibujar(p, t) {
      switch (p.tipo) {
        case 'nieve':
          cx.globalAlpha = p.a; var d = p.r * 2.6; cx.drawImage(soft(), p.x - d / 2, p.y - d / 2, d, d); break;
        case 'corazones':
          cx.globalAlpha = p.a * Math.min(1, Math.max(.15, p.y / (H * .25))); cx.fillStyle = p.c;
          cx.save(); cx.translate(p.x, p.y); cx.rotate(Math.sin(t * p.f + p.ph) * p.rot); heart(0, -p.s / 2, p.s); cx.restore(); break;
        case 'confeti': case 'papelitos':
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.scale(1, Math.cos(t * 3 + p.ph));
          cx.globalAlpha = p.a; cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          if (p.tipo === 'papelitos') { cx.strokeStyle = 'rgba(0,0,0,.22)'; cx.lineWidth = .8; cx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); }
          cx.restore(); break;
        case 'petalos':
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.scale(1, .6 + .4 * Math.cos(t * 2 + p.ph));
          cx.globalAlpha = p.a; cx.fillStyle = p.c; cx.beginPath(); cx.moveTo(0, -p.s);
          cx.quadraticCurveTo(p.s * .95, -p.s * .15, 0, p.s); cx.quadraticCurveTo(-p.s * .95, -p.s * .15, 0, -p.s); cx.fill(); cx.restore(); break;
        case 'murcielagos': bat(p, t); break;
        case 'estrellas':
          var tw = (Math.sin(t * p.f + p.ph) + 1) / 2; cx.save(); cx.translate(p.x, p.y); cx.globalAlpha = .15 + .85 * tw; cx.fillStyle = p.c;
          var s = p.s * (.6 + .6 * tw); cx.beginPath();
          cx.moveTo(0, -s); cx.quadraticCurveTo(s * .12, -s * .12, s, 0); cx.quadraticCurveTo(s * .12, s * .12, 0, s);
          cx.quadraticCurveTo(-s * .12, s * .12, -s, 0); cx.quadraticCurveTo(-s * .12, -s * .12, 0, -s); cx.fill(); cx.restore(); break;
      }
    }
    function cantidadObjetivo() {
      var area = Math.max(.35, Math.min(1.2, (W * H) / (1440 * 900)));
      var n = cfg.cant * area * cfg.inten * Math.pow(.5, nivel);
      if (cfg.tipo === 'murcielagos') n = Math.max(3, Math.min(14, n));
      return Math.round(Math.max(4, n));
    }
    function ajustarCantidad() {
      var n = cantidadObjetivo();
      while (parts.length < n) parts.push(nueva(cfg.tipo, true));
      if (parts.length > n) parts.length = n;
    }
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      if (!last) { last = ts; return; }
      var dt = Math.min(.05, (ts - last) / 1000); last = ts;
      // rendimiento: si el equipo va lento, baja la cantidad y, si persiste, se apaga
      frames++; acc += dt;
      if (frames === 90) {
        if (acc / frames > .034) { nivel++; if (nivel >= 3) { detener(); return; } ajustarCantidad(); }
        frames = 0; acc = 0;
      }
      var gate = document.getElementById('gate'); cv.style.zIndex = gate ? 201 : 60;
      var t = (ts - t0) / 1000;
      cx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) { paso(parts[i], dt, t); cx.globalAlpha = 1; dibujar(parts[i], t); }
      cx.globalAlpha = 1;
    }
    function iniciar(tipo, colores, cant, vel, inten) {
      detener(); crear();
      var cols = (colores || []).filter(colorOk);
      var defecto = { nieve: ['#fff'], corazones: ['#e0264f', '#ff6b8b'], confeti: ['#f07d00', '#00a047', '#1e63e0', '#e0264f', '#f5c400'], papelitos: ['#d91023', '#fff'], petalos: ['#ff9eb5', '#ffd1dc'], murcielagos: ['#1a1a1a'], estrellas: ['#f5c400', '#fff'] };
      cfg = { tipo: tipo, cols: cols.length ? cols : (defecto[tipo] || ['#fff']), cant: cant || 60, vel: vel || 1, inten: Math.max(.3, Math.min(1.5, inten / 100)) };
      nivel = 0; frames = 0; acc = 0; last = 0; t0 = performance.now(); parts = []; ajustarCantidad();
      cv.style.display = 'block'; raf = requestAnimationFrame(frame);
    }
    function detener() {
      if (raf) cancelAnimationFrame(raf); raf = 0; parts = [];
      if (cx) cx.clearRect(0, 0, W, H); if (cv) cv.style.display = 'none';
    }
    return { iniciar: iniciar, detener: detener };
  })();

  var TIPOS = ['nieve', 'corazones', 'confeti', 'papelitos', 'petalos', 'murcielagos', 'estrellas'];
  function permitidoMovimiento() {
    var user = null; try { user = localStorage.getItem(FX_KEY); } catch (e) {}
    if (user === 'off') return false;
    if (user !== 'on' && window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches) return false;
    return true;
  }
  function botonFx(mostrar) {
    var b = $('campus-fxbtn');
    if (!mostrar) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      b = document.createElement('button'); b.id = 'campus-fxbtn'; b.type = 'button'; b.textContent = '✨';
      b.onclick = function () {
        var on = permitidoMovimiento();
        try { localStorage.setItem(FX_KEY, on ? 'off' : 'on'); } catch (e) {}
        aplicar();
      };
      document.body.appendChild(b);
    }
    var on = permitidoMovimiento();
    b.style.display = 'grid'; b.classList.toggle('off', !on);
    b.title = on ? 'Desactivar animaciones' : 'Activar animaciones'; b.setAttribute('aria-label', b.title);
  }

  function aplicarTema(d, tema) {
    guardarOriginales();
    var cols = tema ? String(tema.colores || '').split(',').map(function (x) { return x.trim(); }).filter(colorOk) : [];
    aplicarBanner(d, tema);
    ponerGorro(tema);
    ponerDeco(tema, cols);
    var tipo = tema ? String(tema.animacion || '').toLowerCase() : '';
    var hay = TIPOS.indexOf(tipo) >= 0 && animacionesOn(d);
    if (hay && permitidoMovimiento()) Motor.iniciar(tipo, cols, num(tema.cantidad, 60), num(tema.velocidad, 1), intensidad(d));
    else Motor.detener();
    botonFx(hay);
  }

  function badgePrev(d) {
    var v = $('campus-prev'); if (v) v.remove();
    var prev = leerPrev(); if (!prev) return;
    var t = (d.temas || []).filter(function (x) { return x.id === prev.tema; })[0];
    var div = document.createElement('div'); div.id = 'campus-prev';
    div.appendChild(document.createTextNode('Vista previa: ' + (t ? t.nombre : 'sin tema')));
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Salir';
    b.onclick = function () { try { localStorage.removeItem(PREV_KEY); } catch (e) {} aplicar(); };
    div.appendChild(b); document.body.appendChild(div);
  }

  /* ------------------------- pipeline principal ------------------------- */
  function aplicar() {
    if (!DATA || !hasDOM) return;
    inyectarCSS(); guardarOriginales();
    var hoy = new Date();
    var tema = resolverTema(DATA, hoy);
    if (hooks && hooks.setData) { try { hooks.setData(build(DATA, tema, hoy)); } catch (e) { console.error('[campus] datos', e); } }
    try { aplicarTextos(DATA); } catch (e) { console.error(e); }
    try { aplicarTema(DATA, tema); } catch (e) { console.error(e); }
    try { aviso(DATA, hoy); mantenimiento(DATA); badgePrev(DATA); } catch (e) { console.error(e); }
    iniciarGesto();
  }

  function sinTs(d) { var c = Object.assign({}, d); delete c.generado; return JSON.stringify(c); }
  function traer(fresco) {
    if (!API_URL) return Promise.resolve(null);
    return fetch(API_URL + (API_URL.indexOf('?') >= 0 ? '&' : '?') + 'accion=config' + (fresco ? '&fresco=1' : '') + '&_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && d.config ? d : null; })
      .catch(function () { return null; });
  }
  function refrescar(fresco) {
    return traer(fresco).then(function (d) {
      if (!d) return false;
      var cambio = !DATA || sinTs(d) !== sinTs(DATA);
      DATA = d;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
      if (cambio) aplicar();
      return true;
    });
  }

  /* ------------------------- Panel master ------------------------- */
  function post(accion, extra) {
    if (!API_URL) return Promise.reject(new Error('Falta pegar API_URL en campus-config.js'));
    var body = Object.assign({ accion: accion, clave: claveMaster }, extra || {});
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Error'); return j; });
  }
  function modal(html) {
    var viejo = $('campus-master'); if (viejo) viejo.remove();
    var ov = document.createElement('div'); ov.id = 'campus-master'; ov.innerHTML = '<div class="cm-box">' + html + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov); return ov;
  }
  function pedirClave() {
    var ov = modal('<div class="cm-h"><b>Panel master</b><button class="cm-x" type="button" aria-label="Cerrar">✕</button></div>' +
      '<div class="cm-b"><label for="cm-k">Clave master</label><input id="cm-k" type="password" autocomplete="off">' +
      '<div class="cm-msg err" id="cm-e"></div><div class="cm-row"><button class="cm-btn cm-pri" id="cm-go" type="button">Entrar</button></div></div>');
    ov.querySelector('.cm-x').onclick = function () { ov.remove(); };
    var k = ov.querySelector('#cm-k'), e = ov.querySelector('#cm-e'); k.focus();
    function entrar() {
      e.textContent = 'Verificando…'; claveMaster = k.value;
      post('verificar').then(function (j) {
        hojaUrl = (j && j.hoja_url) || '';
        try { sessionStorage.setItem('campus_master', '1'); } catch (x) {}
        mantenimiento(DATA || { config: {} }); abrirPanel();
      }).catch(function (er) { claveMaster = ''; e.textContent = er.message; });
    }
    ov.querySelector('#cm-go').onclick = entrar;
    k.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') entrar(); });
  }
  function abrirMaster() {
    if (!hasDOM) return;
    inyectarCSS();
    if (!API_URL) { modal('<div class="cm-h"><b>Panel master</b><button class="cm-x" type="button" onclick="this.closest(\'#campus-master\').remove()">✕</button></div><div class="cm-b"><p>Falta conectar la hoja: pega la URL de la app web en <b>API_URL</b> dentro de campus-config.js.</p></div>'); return; }
    if (claveMaster) abrirPanel(); else pedirClave();
  }
  var hojaUrl = '';
  var HOJAS = [['Frases', 'Frases del corazón'], ['Enlaces', 'Botones y enlaces'], ['Secciones', 'Secciones'], ['Calculadoras', 'Calculadoras'],
    ['Contactos', 'Contactos de WhatsApp'], ['Avisos', 'Avisos'], ['Temas', 'Temas festivos']];
  var KEYS = { Frases: 'frases', Enlaces: 'enlaces', Secciones: 'secciones', Calculadoras: 'calculadoras', Contactos: 'contactos', Avisos: 'avisos', Temas: 'temas' };
  var LBL = { Frases: 'frase', Enlaces: 'texto', Secciones: 'titulo', Calculadoras: 'nombre', Contactos: 'nombre', Avisos: 'texto', Temas: 'nombre' };
  var CON_ORDEN = { Enlaces: 1, Secciones: 1, Calculadoras: 1, Contactos: 1 };
  var SINO = { activo: 1, activa: 1, clave: 1 };
  var AREA = { frase: 1, descripcion: 1, descripcion_inicio: 1 };
  var IMGK = { hero_imagen: 1, logo_imagen: 1, imagen: 1, gorro: 1 };
  var ESQ_DEF = {
    Frases: ['id', 'frase', 'tema', 'activa', 'fecha', 'autor'],
    Temas: ['id', 'nombre', 'activo', 'inicio', 'fin', 'prioridad', 'animacion', 'cantidad', 'velocidad', 'colores', 'decoracion', 'gorro', 'gorro_x', 'gorro_y', 'gorro_alto', 'gorro_giro', 'etiqueta_hero', 'color_etiqueta', 'banner_color_1', 'banner_color_2', 'hero_imagen', 'musica_url'],
    Secciones: ['id', 'titulo', 'descripcion', 'icono', 'paleta', 'url', 'activo', 'ubicacion', 'orden', 'descripcion_inicio'],
    Enlaces: ['id', 'seccion', 'grupo', 'texto', 'icono', 'url', 'clave', 'destacado', 'abre', 'orden', 'activo'],
    Calculadoras: ['id', 'nombre', 'imagen', 'url', 'color', 'orden', 'activo'],
    Contactos: ['id', 'nombre', 'detalle', 'url', 'orden', 'activo'],
    Avisos: ['id', 'texto', 'inicio', 'fin', 'color', 'enlace', 'activo']
  };
  var ETQ = {
    frase: 'Frase', tema: 'Tema (todos, o el id de un tema)', activa: 'Activa', activo: 'Activo', fecha: 'Fecha fija (MM-DD, opcional)', autor: 'Autor (opcional)',
    seccion: 'Sección (id)', grupo: 'Grupo / subtítulo (opcional)', texto: 'Texto', icono: 'Icono (chat, mail, calc, search, book, star…)', url: 'Enlace (https://…)',
    clave: 'Pide clave de simuladores', destacado: 'Destacado (1 o 2, opcional)', abre: 'Abre (calc, mas o vacío)', orden: 'Orden (número)',
    titulo: 'Título', descripcion: 'Descripción', paleta: 'Paleta de color (0 a 5)', ubicacion: 'Ubicación (inicio, inferior, interna)', descripcion_inicio: 'Descripción en la página de inicio',
    nombre: 'Nombre', imagen: 'Imagen (nombre de archivo, id de Drive o enlace)', color: 'Color (#rrggbb)', detalle: 'Detalle',
    inicio: 'Inicio (MM-DD o regla)', fin: 'Fin (MM-DD o regla)', enlace: 'Enlace (opcional)', prioridad: 'Prioridad', animacion: 'Animación (nieve, corazones, confeti…)',
    cantidad: 'Cantidad de partículas', velocidad: 'Velocidad', colores: 'Colores (separados por coma)', decoracion: 'Decoración (luces, banderines, ninguna)',
    gorro: 'Gorro del logo (santa, bruja, ninguno o archivo)', gorro_x: 'Gorro: posición X', gorro_y: 'Gorro: posición Y', gorro_alto: 'Gorro: tamaño', gorro_giro: 'Gorro: giro',
    etiqueta_hero: 'Etiqueta del banner', color_etiqueta: 'Color de la etiqueta', banner_color_1: 'Banner: color 1', banner_color_2: 'Banner: color 2',
    hero_imagen: 'Imagen del banner (archivo)', musica_url: 'Música (enlace mp3, opcional)'
  };
  var AJ = [
    ['hero_etiqueta', 'Etiqueta del banner'], ['hero_titulo', 'Título del banner'], ['hero_subtitulo', 'Subtítulo del banner'],
    ['hero_imagen', 'Imagen del banner (nombre de archivo)'], ['logo_imagen', 'Logo alternativo (nombre de archivo)'],
    ['gate_titulo', 'Título de la pantalla del PIN'], ['gate_texto', 'Texto bajo el título del PIN'],
    ['titulo_tienda', 'Título «Asesores en tienda»'], ['titulo_formacion', 'Título «Mi formación»'],
    ['footer_titulo', 'Pie de página: línea 1'], ['footer_sedes', 'Pie de página: línea 2 (sedes)'],
    ['calc_pie', 'Texto al pie del calculador'], ['mas_texto_1', 'Más herramientas: título'], ['mas_texto_2', 'Más herramientas: texto'],
    ['musica_url', 'Música de fondo (enlace mp3)'], ['volumen_inicial', 'Volumen inicial (0 a 1)']
  ];
  function det(t, html, abierto) {
    return '<details class="cm-d"' + (abierto ? ' open' : '') + '><summary>' + t + '</summary><div class="cm-dc">' + html + '</div></details>';
  }

  function abrirPanel() {
    var d = DATA || { config: {}, temas: [] };
    var prev = leerPrev(), cfg = d.config || {};
    var modo = String(cfg.modo_tema || 'auto').toLowerCase();
    var sel = prev ? (prev.tema || '__ninguno') : (modo === 'manual' ? (cfg.tema_manual || '__auto') : modo === 'ninguno' ? '__ninguno' : '__auto');
    var temas = d.temas || [];
    var opts = '<option value="__auto">Automático (según fechas)</option><option value="__ninguno">Sin tema</option>' +
      temas.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.nombre || t.id) + '</option>'; }).join('');
    var optsFrase = '<option value="todos">Para todos los días</option>' +
      temas.map(function (t) { return '<option value="' + esc(t.id) + '">Solo ' + esc(t.nombre || t.id) + '</option>'; }).join('');
    var optsHoja = HOJAS.map(function (h) { return '<option value="' + h[0] + '">' + esc(h[1]) + '</option>'; }).join('');
    var ahora = resolverTema(d, new Date());
    var ajustes = AJ.map(function (a) {
      var ayuda = (d.config_ayuda || {})[a[0]] || '';
      return '<label for="cm-a-' + a[0] + '">' + esc(a[1]) + '</label><input type="text" id="cm-a-' + a[0] + '" data-k="' + a[0] + '"' +
        (IMGK[a[0]] ? ' list="cm-imgs"' : '') + ' value="' + esc(cfg[a[0]] || '') + '">' + (ayuda ? '<small class="cm-h2">' + esc(ayuda) + '</small>' : '');
    }).join('');

    var ov = modal(
      '<div class="cm-h"><b>Panel master</b><button class="cm-x" type="button" aria-label="Cerrar">✕</button></div><div class="cm-b">' +
      '<datalist id="cm-imgs"></datalist><datalist id="cm-secs"></datalist>' +
      det('Tema, animaciones y mantenimiento',
        '<p class="cm-st">Tema ahora: <b>' + esc(ahora ? ahora.nombre : 'ninguno') + '</b>' + (prev ? ' (vista previa)' : '') + '</p>' +
        '<label for="cm-tema">Tema</label><select id="cm-tema">' + opts + '</select>' +
        '<label class="cm-sw"><input type="checkbox" id="cm-anim"> Animaciones encendidas</label>' +
        '<label for="cm-int">Intensidad: <span id="cm-iv"></span></label><input id="cm-int" type="range" min="30" max="150" step="10">' +
        '<label class="cm-sw"><input type="checkbox" id="cm-mt"> Pantalla de mantenimiento (tú sigues entrando)</label>' +
        '<input id="cm-mm" type="text" placeholder="Mensaje de mantenimiento" value="' + esc(cfg.mantenimiento_mensaje || '') + '">' +
        '<div class="cm-row"><button class="cm-btn" id="cm-prev" type="button">Probar en mi pantalla</button><button class="cm-btn cm-pri" id="cm-pub" type="button">Publicar para todos</button></div>', true) +
      det('Claves',
        '<div class="cm-row"><button class="cm-btn" id="cm-vk" type="button">Ver claves actuales</button></div><p class="cm-st" id="cm-kv" hidden></p>' +
        '<input id="cm-pin" type="text" inputmode="numeric" maxlength="4" placeholder="Nuevo PIN (4 dígitos)">' +
        '<input id="cm-ck" type="text" placeholder="Nueva clave de simuladores (mín. 4)">' +
        '<input id="cm-mk" type="text" placeholder="Nueva clave master (mín. 8)">' +
        '<button class="cm-btn cm-pri" id="cm-sk" type="button">Guardar claves</button>') +
      det('Frase del corazón',
        '<label for="cm-fm">Cómo cambia la frase</label><div class="cm-row"><select id="cm-fm" style="flex:1"><option value="dia">Una por día (la misma todo el día)</option><option value="aleatoria">Aleatoria (cambia en cada toque)</option></select><button class="cm-btn" id="cm-fms" type="button">Guardar</button></div>' +
        '<label for="cm-fr">Frase nueva</label><textarea id="cm-fr" rows="3" placeholder="Escribe una frase nueva"></textarea>' +
        '<div class="cm-row"><select id="cm-ft" style="flex:1">' + optsFrase + '</select><button class="cm-btn cm-pri" id="cm-fa" type="button">Agregar</button></div>' +
        '<button class="cm-btn" id="cm-fe" type="button">Ver, editar o borrar frases</button>') +
      det('Contenido: botones, secciones, calculadoras, contactos, avisos y temas',
        '<select id="cm-hs">' + optsHoja + '</select><select id="cm-sf" style="display:none"></select><div id="cm-ed"></div>').replace('<details class="cm-d"', '<details class="cm-d" id="cm-det-ed"') +
      det('Textos y ajustes', ajustes + '<button class="cm-btn cm-pri" id="cm-as" type="button">Guardar textos</button>') +
      det('Imágenes',
        '<input id="cm-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif">' +
        '<label for="cm-uso">Usar la imagen como</label><select id="cm-uso"><option value="">Solo subirla (la uso después en la hoja)</option><option value="hero">Imagen del banner</option><option value="logo">Logo del campus</option></select>' +
        '<button class="cm-btn cm-pri" id="cm-up" type="button">Subir a la carpeta de Drive</button><small class="cm-h2" id="cm-ni"></small>') +
      '<div class="cm-row" style="margin-top:6px"><button class="cm-btn" id="cm-ref" type="button">Refrescar datos</button><button class="cm-btn" id="cm-hoja" type="button">Abrir la hoja</button></div>' +
      '</div><div class="cm-bar"><div class="cm-msg" id="cm-m"></div></div>');

    var $$ = function (s) { return ov.querySelector(s); };
    var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
    function m(t, ok) { var el = $$('#cm-m'); el.textContent = t; el.className = 'cm-msg ' + (ok ? 'ok' : 'err'); }
    var ed = { hoja: 'Frases', id: null, nueva: false };

    /* ---- listas auxiliares (nombres de imágenes, ids de secciones) ---- */
    function listas() {
      var im = Object.keys((DATA && DATA.imagenes) || {}).sort();
      $$('#cm-imgs').innerHTML = im.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
      var ids = ['tienda'].concat(((DATA && DATA.secciones) || []).map(function (s) { return s.id; }));
      $$('#cm-secs').innerHTML = ids.map(function (i) { return '<option value="' + esc(i) + '">'; }).join('');
      var sf = $$('#cm-sf'), v = sf.value;
      sf.innerHTML = '<option value="">Todas las secciones</option>' + ids.map(function (i) { return '<option value="' + esc(i) + '">' + esc(i) + '</option>'; }).join('');
      sf.value = v;
      $$('#cm-ni').textContent = im.length
        ? 'Imágenes en la carpeta (' + im.length + '): ' + im.slice(0, 15).join(', ') + (im.length > 15 ? '…' : '')
        : 'La carpeta aún no tiene imágenes (o falta usar «Compartir carpeta» en el menú de la hoja).';
    }

    /* ---- editor genérico de hojas ---- */
    function filas(hoja) { return (DATA && DATA[KEYS[hoja]]) || []; }
    function colsDe(hoja) { return ((DATA && DATA.esquema) || ESQ_DEF)[hoja] || ESQ_DEF[hoja]; }
    function campo(c, v, hoja, nueva) {
      v = (v === undefined || v === null) ? '' : v;
      var lb = '<label>' + esc(ETQ[c] || c) + '</label>';
      if (SINO[c]) {
        var on = v === '' ? true : si(v, true);
        return lb + '<select data-c="' + c + '"><option value="SI"' + (on ? ' selected' : '') + '>SI</option><option value="NO"' + (on ? '' : ' selected') + '>NO</option></select>';
      }
      if (AREA[c] || (c === 'texto' && hoja === 'Avisos')) return lb + '<textarea data-c="' + c + '" rows="3">' + esc(v) + '</textarea>';
      var lista = IMGK[c] ? ' list="cm-imgs"' : (c === 'seccion' ? ' list="cm-secs"' : '');
      return lb + '<input type="text" data-c="' + c + '"' + lista + ' value="' + esc(v) + '">';
    }
    function formHTML(hoja, fila) {
      var cols = colsDe(hoja).filter(function (c) { return c !== 'id'; });
      var base = fila || {};
      if (!fila && hoja === 'Enlaces' && $$('#cm-sf').value) base = { seccion: $$('#cm-sf').value };
      return '<div class="cm-form"><h4>' + (fila ? 'Editar' : 'Nuevo') + '</h4>' +
        cols.map(function (c) { return campo(c, base[c], hoja, !fila); }).join('') +
        '<div class="cm-row"><button class="cm-btn cm-pri" type="button" data-a="save">Guardar</button><button class="cm-btn" type="button" data-a="cancel">Cancelar</button></div></div>';
    }
    function renderEd() {
      var box = $$('#cm-ed'), hoja = ed.hoja, sf = $$('#cm-sf');
      sf.style.display = hoja === 'Enlaces' ? '' : 'none';
      var filtro = hoja === 'Enlaces' ? sf.value : '';
      var todas = filas(hoja);
      var lista = todas.filter(function (r) { return !filtro || r.seccion === filtro; });
      if (CON_ORDEN[hoja]) lista = lista.slice().sort(function (a, b) {
        return (hoja === 'Enlaces' ? String(a.seccion).localeCompare(String(b.seccion)) : 0) || porOrden(a, b);
      });
      var act = hoja === 'Frases' ? 'activa' : 'activo';
      var html = '<div class="cm-row"><button class="cm-btn cm-pri" type="button" data-a="new">+ Nuevo</button></div>';
      if (todas.some(function (r) { return !r.id; })) html += '<p class="cm-st">Hay filas sin ID, no se pueden editar todavía. <button class="cm-btn" type="button" data-a="fix">Reparar hojas</button></p>';
      html += lista.length ? lista.map(function (r) {
        var on = si(r[act], true);
        var lbl = String(r[LBL[hoja]] || r.id || '(sin texto)'); if (lbl.length > 70) lbl = lbl.slice(0, 70) + '…';
        var meta = hoja === 'Enlaces' ? (r.seccion || '') + (r.grupo ? ' · ' + r.grupo : '')
          : hoja === 'Frases' ? (r.fecha ? r.fecha + ' · ' : '') + (r.tema || 'todos')
          : hoja === 'Temas' ? (r.inicio || '') + ' → ' + (r.fin || '') : '';
        return '<div class="cm-r' + (on ? '' : ' off') + '" data-id="' + esc(r.id || '') + '"><div class="cm-rt"><b>' + esc(lbl) + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</div><div class="cm-ra">' +
          (CON_ORDEN[hoja] ? '<button type="button" data-a="up" title="Subir">↑</button><button type="button" data-a="dn" title="Bajar">↓</button>' : '') +
          '<button type="button" data-a="tg" title="' + (on ? 'Desactivar' : 'Activar') + '">' + (on ? '●' : '○') + '</button>' +
          '<button type="button" data-a="ed" title="Editar">✎</button><button type="button" data-a="del" title="Borrar">🗑</button></div></div>';
      }).join('') : '<p class="cm-h2">No hay filas todavía.</p>';
      if (ed.nueva) html += formHTML(hoja, null);
      else if (ed.id) {
        var fila = todas.filter(function (r) { return r.id === ed.id; })[0];
        if (fila) html += formHTML(hoja, fila); else ed.id = null;
      }
      box.innerHTML = html;
    }
    function recargar() { return refrescar(true).then(function (ok) { listas(); renderEd(); return ok; }); }
    function accion(promesa, ok) {
      return promesa.then(function () { return recargar(); }).then(function () { m(ok, true); }).catch(function (er) { m(er.message); });
    }

    $$('#cm-hs').onchange = function () { ed.hoja = this.value; ed.id = null; ed.nueva = false; renderEd(); };
    $$('#cm-sf').onchange = function () { ed.id = null; ed.nueva = false; renderEd(); };
    $$('#cm-ed').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-a]') : null; if (!b) return;
      var a = b.getAttribute('data-a'), row = b.closest ? b.closest('.cm-r') : null, id = row ? row.getAttribute('data-id') : '';
      var hoja = ed.hoja, act = hoja === 'Frases' ? 'activa' : 'activo';
      if (['up', 'dn', 'tg', 'ed', 'del'].indexOf(a) >= 0 && !id) { m('Esta fila no tiene ID. Usa «Reparar hojas».'); return; }
      var fila = id ? filas(hoja).filter(function (r) { return r.id === id; })[0] : null;
      if (a === 'new') { ed.nueva = true; ed.id = null; renderEd(); var f1 = $$('.cm-form'); if (f1) f1.scrollIntoView({ block: 'nearest' }); }
      else if (a === 'ed') { ed.nueva = false; ed.id = id; renderEd(); var f2 = $$('.cm-form'); if (f2) f2.scrollIntoView({ block: 'nearest' }); }
      else if (a === 'cancel') { ed.nueva = false; ed.id = null; renderEd(); }
      else if (a === 'fix') { m('Reparando…', true); accion(post('reparar'), 'Hojas reparadas.'); }
      else if (a === 'up' || a === 'dn') { accion(post('fila_mover', { hoja: hoja, id: id, dir: a === 'up' ? -1 : 1 }), 'Orden actualizado.'); }
      else if (a === 'tg') { accion(post('fila_guardar', { hoja: hoja, fila: (function () { var o = { id: id }; o[act] = si(fila && fila[act], true) ? 'NO' : 'SI'; return o; })() }), 'Listo.'); }
      else if (a === 'del') {
        var nom = fila ? String(fila[LBL[hoja]] || id) : id;
        if (!confirm('¿Borrar «' + nom.slice(0, 60) + '»? No se puede deshacer.\n\nSi solo quieres ocultarlo, desactívalo con el círculo.')) return;
        accion(post('fila_borrar', { hoja: hoja, id: id }), 'Borrado.');
      }
      else if (a === 'save') {
        var datos = {};
        each($$('#cm-ed').querySelectorAll('[data-c]'), function (el) { datos[el.getAttribute('data-c')] = el.value; });
        if (ed.id) datos.id = ed.id;
        var estabaNueva = ed.nueva; ed.id = null; ed.nueva = false;
        m('Guardando…', true);
        post('fila_guardar', { hoja: hoja, fila: datos }).then(function () { return recargar(); })
          .then(function () { m(estabaNueva ? 'Creado.' : 'Guardado.', true); })
          .catch(function (er) { m(er.message); });
      }
    });

    /* ---- tema, animaciones, mantenimiento ---- */
    $$('#cm-tema').value = sel;
    $$('#cm-anim').checked = prev && prev.anim !== undefined ? !!prev.anim : si(cfg.animaciones, true);
    $$('#cm-mt').checked = si(cfg.mantenimiento, false);
    $$('#cm-int').value = intensidad(d); $$('#cm-iv').textContent = $$('#cm-int').value;
    $$('.cm-x').onclick = function () { ov.remove(); };
    $$('#cm-int').oninput = function () { $$('#cm-iv').textContent = this.value; };
    $$('#cm-prev').onclick = function () {
      var v = $$('#cm-tema').value, o = { anim: $$('#cm-anim').checked, intensidad: +$$('#cm-int').value };
      if (v === '__auto') { try { localStorage.removeItem(PREV_KEY); } catch (e) {} }
      else { o.tema = v === '__ninguno' ? '' : v; try { localStorage.setItem(PREV_KEY, JSON.stringify(o)); } catch (e) {} }
      aplicar(); m('Vista previa aplicada solo en tu pantalla.', true);
    };
    $$('#cm-pub').onclick = function () {
      var v = $$('#cm-tema').value, c = {
        animaciones: $$('#cm-anim').checked ? 'SI' : 'NO', intensidad: $$('#cm-int').value,
        mantenimiento: $$('#cm-mt').checked ? 'SI' : 'NO', mantenimiento_mensaje: $$('#cm-mm').value
      };
      if (v === '__auto') { c.modo_tema = 'auto'; c.tema_manual = ''; } else if (v === '__ninguno') { c.modo_tema = 'ninguno'; } else { c.modo_tema = 'manual'; c.tema_manual = v; }
      m('Publicando…', true);
      post('guardar', { cambios: c }).then(function () { try { localStorage.removeItem(PREV_KEY); } catch (e) {} return refrescar(true); })
        .then(function () { m('Publicado: ya lo ven todos los asesores.', true); }).catch(function (er) { m(er.message); });
    };

    /* ---- claves ---- */
    $$('#cm-vk').onclick = function () {
      m('Consultando…', true);
      post('ver_claves').then(function (j) {
        var k = $$('#cm-kv'); k.hidden = false;
        k.textContent = 'PIN: ' + (j.pin || '(vacío)') + '   ·   Clave de simuladores: ' + (j.clave_simuladores || '(vacía)');
        m('', true);
      }).catch(function (er) { m(er.message); });
    };
    $$('#cm-sk').onclick = function () {
      var c = {}, p = $$('#cm-pin').value.trim(), k = $$('#cm-ck').value.trim(), mk = $$('#cm-mk').value.trim();
      if (p) c.pin = p; if (k) c.clave_simuladores = k; if (mk) c.clave_master = mk;
      if (!p && !k && !mk) { m('Escribe un PIN o una clave nueva.'); return; }
      post('guardar', { cambios: c }).then(function () {
        if (mk) claveMaster = mk;
        $$('#cm-pin').value = ''; $$('#cm-ck').value = ''; $$('#cm-mk').value = ''; $$('#cm-kv').hidden = true;
        return refrescar(true);
      }).then(function () { m('Claves actualizadas.' + (mk ? ' La clave master nueva ya está activa.' : ''), true); }).catch(function (er) { m(er.message); });
    };

    /* ---- frase del corazón ---- */
    $$('#cm-fm').value = String(cfg.frase_modo || 'dia').toLowerCase() === 'aleatoria' ? 'aleatoria' : 'dia';
    $$('#cm-fms').onclick = function () {
      post('guardar', { cambios: { frase_modo: $$('#cm-fm').value } }).then(function () { return refrescar(true); })
        .then(function () { m('Modo de frase guardado.', true); }).catch(function (er) { m(er.message); });
    };
    $$('#cm-fa').onclick = function () {
      post('agregar_frase', { frase: $$('#cm-fr').value, tema: $$('#cm-ft').value })
        .then(function () { $$('#cm-fr').value = ''; return recargar(); }).then(function () { m('Frase agregada.', true); }).catch(function (er) { m(er.message); });
    };
    $$('#cm-fe').onclick = function () {
      $$('#cm-hs').value = 'Frases'; ed.hoja = 'Frases'; ed.id = null; ed.nueva = false;
      $$('#cm-det-ed').open = true; renderEd(); $$('#cm-det-ed').scrollIntoView({ block: 'start' });
    };

    /* ---- textos y ajustes ---- */
    $$('#cm-as').onclick = function () {
      var cur = (DATA && DATA.config) || {}, c = {};
      each(ov.querySelectorAll('[data-k]'), function (i) { var k = i.getAttribute('data-k'); if (i.value !== (cur[k] || '')) c[k] = i.value; });
      if (!Object.keys(c).length) { m('No hay cambios que guardar.'); return; }
      m('Guardando…', true);
      post('guardar', { cambios: c }).then(function () { return recargar(); }).then(function () { m('Textos guardados.', true); }).catch(function (er) { m(er.message); });
    };

    /* ---- imágenes ---- */
    $$('#cm-up').onclick = function () {
      var f = $$('#cm-file').files[0]; if (!f) { m('Elige una imagen.'); return; }
      if (f.size > 3.5 * 1024 * 1024) { m('La imagen pesa más de 3.5 MB.'); return; }
      var rd = new FileReader(); m('Subiendo…', true);
      rd.onload = function () {
        post('subir_imagen', { nombre: f.name, mime: f.type, base64: String(rd.result).split(',')[1], usar_como: $$('#cm-uso').value })
          .then(function (j) {
            return recargar().then(function () {
              m('Subida como «' + j.nombre + '»' + (j.uso ? ' y puesta como ' + j.uso + '.' : '. Escribe ese nombre en la hoja o en el campo de imagen.'), true);
            });
          }).catch(function (er) { m(er.message); });
      };
      rd.readAsDataURL(f);
    };

    $$('#cm-ref').onclick = function () { m('Actualizando…', true); recargar().then(function (ok) { m(ok ? 'Datos actualizados.' : 'No se pudo conectar con la hoja.', ok); }); };
    $$('#cm-hoja').onclick = function () {
      var u = hojaUrl || (DATA && DATA.hoja_url);
      if (u) window.open(u, '_blank', 'noopener'); else m('No hay enlace de la hoja (vuelve a entrar al panel).');
    };

    listas(); renderEd();
  }

  /* ------------------------- gesto secreto: 7 toques al logo ------------------------- */
  var gestoListo = false;
  function iniciarGesto() {
    if (gestoListo) return; gestoListo = true;
    var n = 0, tm = 0;
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('header img, header .campus-logo')) return;
      n++; clearTimeout(tm); tm = setTimeout(function () { n = 0; }, 3500);
      if (n >= 7) { n = 0; abrirMaster(); }
    });
    document.addEventListener('keydown', function (e) { if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) { e.preventDefault(); abrirMaster(); } });
    if (location.hash === '#master') setTimeout(abrirMaster, 400);
  }

  /* ------------------------- arranque ------------------------- */
  if (hasDOM) {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.d && c.d.config) DATA = c.d;
    } catch (e) {}
    refrescar(false);
  }

  var Campus = {
    attach: function (h) { hooks = h; if (DATA) aplicar(); else if (hasDOM) { inyectarCSS(); iniciarGesto(); } },
    refrescar: refrescar,
    abrirMaster: abrirMaster,
    sha: sha,
    _t: { parseRegla: parseRegla, enRango: enRango, temaDeFecha: temaDeFecha, build: build, frases: frases, si: si, esc: esc, urlSegura: urlSegura, resolverTema: resolverTema }
  };
  if (typeof window !== 'undefined') window.Campus = Campus;
  if (typeof module !== 'undefined' && module.exports) module.exports = Campus;
})();
