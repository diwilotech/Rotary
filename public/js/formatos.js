// Formatos del distrito (window.ROFmt): la hoja formal (encabezado del distrito con su logo, datos, secciones numeradas) para
// llenar (club) o leer (distrito / ya enviada) y el constructor de formatos del distrito. Todo en la página, sin ventanas.
window.ROFmt = (function () {
  const { api, esc } = window.App;
  const TIPOS = [['parrafo', 'Párrafo (texto largo)', 'bi-text-paragraph'], ['texto', 'Respuesta corta', 'bi-input-cursor-text'], ['numero', 'Número', 'bi-123'], ['dinero', 'Dinero', 'bi-cash'],
    ['fecha', 'Fecha', 'bi-calendar-event'], ['opciones', 'Elegir una opción', 'bi-ui-radios'], ['si_no', 'Sí / No', 'bi-toggle-on'], ['seccion', 'Título de sección', 'bi-type-h2'], ['nota', 'Nota (texto libre)', 'bi-sticky']];
  const esPregunta = (s) => s.tipo !== 'seccion' && s.tipo !== 'nota';
  const EST = { borrador: ['free', 'Borrador'], enviado: ['soon', 'En revisión'], aprobado: ['ok', 'Aprobado'], devuelto: ['bad', 'Devuelto para corregir'], rechazado: ['bad', 'No aprobado'] };
  const chip = (e) => window.App.Crud.chip(...(EST[e] || EST.borrador));
  const money = (n) => `$ ${Number(n || 0).toLocaleString('es-CO')}`;
  const fechaLarga = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  let enc = null;
  const encabezado = async () => (enc ||= await api('/api/formatos/encabezado').catch(() => ({ distrito: 'Distrito', programa: '' })));

  function css() {
    if (document.getElementById('ro-fmt-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="ro-fmt-css">
      .fmt-fondo{background:color-mix(in srgb,var(--bs-body-color) 6%,var(--bs-body-bg));border-radius:18px;padding:clamp(8px,3vw,28px)}
      .fmt-hoja{--az:#17458f;--oro:#f7a81b;background:#fff;color:#1f2937;max-width:860px;margin:0 auto;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.12);padding:clamp(20px,5vw,56px) clamp(18px,5vw,60px);font-size:.95rem}
      .fmt-hoja .form-control,.fmt-hoja .form-select{background:#fff;color:#111827}
      .fmt-cab{display:flex;align-items:center;gap:18px;padding-bottom:14px;border-bottom:4px solid var(--az);position:relative}
      .fmt-cab::after{content:"";position:absolute;left:0;right:0;bottom:-9px;height:3px;background:var(--oro)}
      .fmt-logo{height:72px;width:auto;max-width:200px;object-fit:contain}.fmt-logo-i{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;background:var(--az);color:var(--oro);font-size:2.2rem;flex:none}
      .fmt-cab-t{margin-left:auto;text-align:right}.fmt-cab-t .d{font:700 1.5rem/1.1 Georgia,'Times New Roman',serif;color:var(--az);letter-spacing:.02em;text-transform:uppercase}
      .fmt-cab-t .p{font-size:.78rem;letter-spacing:.18em;text-transform:uppercase;color:#6b7280}
      .fmt-tit{text-align:center;margin:34px 0 6px;font:700 1.35rem/1.25 Georgia,'Times New Roman',serif;color:#111827;text-transform:uppercase;letter-spacing:.04em}
      .fmt-desc{text-align:center;color:#6b7280;font-size:.86rem;max-width:620px;margin:0 auto 18px;white-space:pre-wrap}
      .fmt-datos{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));border:1px solid #d1d5db;border-radius:4px;margin:18px 0 26px}
      .fmt-datos>div{padding:8px 12px;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}.fmt-datos small{display:block;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#6b7280}
      .fmt-datos b{font-weight:600}.fmt-datos input{border:0;border-bottom:1px dashed #9ca3af;border-radius:0;padding:2px 0;font-weight:600;box-shadow:none!important}
      .fmt-sec{margin:28px 0 12px;padding:6px 12px;background:var(--az);color:#fff;font-weight:700;font-size:.82rem;letter-spacing:.14em;text-transform:uppercase;border-left:6px solid var(--oro)}
      .fmt-q{margin:0 0 18px;break-inside:avoid}.fmt-q>label,.fmt-q>.l{display:block;font-weight:700;color:#111827;margin-bottom:2px}.fmt-q .n{color:var(--az);margin-right:4px}
      .fmt-q .req{color:#b91c1c;margin-left:2px}.fmt-q .a{display:block;font-size:.8rem;font-style:italic;color:#6b7280;margin-bottom:6px}
      .fmt-q input.form-control,.fmt-q select{border:0;border-bottom:1.5px solid #9ca3af;border-radius:0;padding-left:2px;box-shadow:none!important;max-width:420px}
      .fmt-q input.form-control:focus,.fmt-q textarea:focus{border-color:var(--az)}
      .fmt-q textarea{border:1px solid #d1d5db;border-radius:4px;min-height:110px;resize:vertical;line-height:28px;padding:4px 10px;box-shadow:none!important;
        background:repeating-linear-gradient(#fff 0 27px,#eef2f7 27px 28px)!important;background-attachment:local!important}
      .fmt-q .v{white-space:pre-wrap;padding:4px 0 6px;border-bottom:1px solid #e5e7eb;min-height:1.6em}.fmt-q .v.vacio{color:#9ca3af;font-style:italic}
      .fmt-ops{display:flex;flex-wrap:wrap;gap:6px}.fmt-ops label{display:inline-flex;gap:6px;align-items:center;border:1px solid #d1d5db;border-radius:999px;padding:4px 12px;cursor:pointer;font-size:.88rem}
      .fmt-ops input{accent-color:var(--az)}.fmt-ops label:has(input:checked){border-color:var(--az);background:#e8eef8;color:var(--az);font-weight:600}
      .fmt-pie{margin-top:40px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;gap:12px;font-size:.72rem;color:#6b7280}
      .fmt-firma{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:46px}.fmt-firma div{border-top:1px solid #6b7280;padding-top:4px;font-size:.78rem;color:#4b5563;text-align:center}
      .fmt-aviso{max-width:860px;margin:0 auto 14px}
      .fmt-nota{margin:0 0 18px;padding:10px 14px;border-left:4px solid var(--oro);background:#fffbeb;color:#4b5563;font-size:.9rem;white-space:pre-wrap;border-radius:0 6px 6px 0}
      .fmt-hoja--ed [contenteditable]{outline:none;border-radius:4px;cursor:text}.fmt-hoja--ed [contenteditable]:hover{background:rgba(23,69,143,.05)}
      .fmt-hoja--ed [contenteditable]:focus{background:rgba(23,69,143,.07);box-shadow:0 0 0 2px rgba(23,69,143,.25)}
      .fmt-hoja--ed [contenteditable]:empty::before{content:attr(data-ph);color:#9ca3af;font-style:italic;font-weight:400}
      .fmt-hoja--ed .fmt-sec [contenteditable]:empty::before{color:rgba(255,255,255,.7)}
      .fmt-b{position:relative;border-radius:8px;margin:0 -10px;padding:6px 10px;border:1px dashed transparent}.fmt-b:hover,.fmt-b:focus-within{border-color:#c7d2fe}
      .fmt-b.on{border-color:#6366f1;background:rgba(99,102,241,.03)}
      .fmt-bar{position:absolute;top:-16px;right:8px;display:none;gap:4px;align-items:center;background:#fff;border:1px solid #d1d5db;border-radius:999px;padding:2px 6px;box-shadow:0 4px 12px rgba(0,0,0,.08);z-index:3;font-size:.78rem;color:#374151}
      .fmt-b:hover .fmt-bar,.fmt-b:focus-within .fmt-bar,.fmt-b.on .fmt-bar{display:flex}
      .fmt-bar select{border:0;background:transparent;font-size:.78rem;padding:0 2px;color:#111827;max-width:150px}.fmt-bar button{border:0;background:transparent;padding:2px 5px;border-radius:6px;color:#374151;line-height:1}
      .fmt-bar button:hover{background:#eef2ff}.fmt-bar button.act{background:#e0e7ff;color:#3730a3;font-weight:600}.fmt-bar .sep{width:1px;height:14px;background:#e5e7eb}
      .fmt-ins{height:14px;margin:2px 0;position:relative;display:flex;justify-content:center;opacity:0;transition:opacity .15s}.fmt-ins:hover,.fmt-ins:focus-within{opacity:1}
      .fmt-ins::before{content:"";position:absolute;left:0;right:0;top:50%;border-top:1px dashed #a5b4fc}.fmt-ins span{position:relative;display:flex;gap:4px;background:#fff;padding:0 6px;top:-5px}
      .fmt-ins button,.fmt-add button{border:1px solid #c7d2fe;background:#fff;color:#3730a3;border-radius:999px;font-size:.72rem;padding:1px 9px}.fmt-ins button:hover,.fmt-add button:hover{background:#eef2ff}
      .fmt-add{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:18px 0 6px;padding:12px;border:1px dashed #c7d2fe;border-radius:8px}.fmt-add button{font-size:.82rem;padding:4px 12px}
      .fmt-op{display:inline-flex;align-items:center;gap:4px;border:1px solid #d1d5db;border-radius:999px;padding:3px 6px 3px 12px;font-size:.88rem;background:#fff}
      .fmt-op [contenteditable]{min-width:40px}.fmt-op button{border:0;background:transparent;color:#9ca3af;padding:0 3px;line-height:1}.fmt-op button:hover{color:#b91c1c}
      .fmt-prev{pointer-events:none;opacity:.75}.fmt-hoja--ed .fmt-q .l{display:flex;gap:2px;align-items:baseline;font-weight:700}.fmt-hoja--ed .fmt-q .l [contenteditable]{flex:1}
      .fmt-ctl{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 14px;border-radius:14px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);max-width:860px;margin:0 auto 14px}
      .fmt-card{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:14px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg)}
      .fmt-card>i{font-size:1.6rem;color:var(--dw-p)}
      .fmt-ed{display:grid;gap:8px}.fmt-ed-s{border:1px solid var(--bs-border-color);border-radius:12px;padding:10px;background:var(--bs-body-bg)}.fmt-ed-s.sec{border-left:5px solid var(--dw-p)}
      @media print{body *{visibility:hidden}.fmt-hoja,.fmt-hoja *{visibility:visible}.fmt-hoja{position:absolute;left:0;top:0;box-shadow:none;max-width:none;padding:0}}
    </style>`);
  }

  const logoHtml = (e) => (e.logo ? `<img class="fmt-logo" src="${esc(e.logo)}" alt="Logo del ${esc(e.distrito)}">` : e.logo_oficial ? `<img class="fmt-logo" src="${esc(e.logo_oficial)}" alt="${esc(e.programa)}">` : '<span class="fmt-logo-i"><i class="bi bi-gear-wide-connected"></i></span>');

  // Hoja formal. x = { formato_nombre, descripcion, secciones, respuestas, titulo, club, estado, fecha, enviado_at, fecha_limite }
  // modo: 'llenar' (inputs) | 'ver' (solo lectura)
  function hoja(e, x, modo = 'ver') {
    css();
    const R = x.respuestas || {}, L = modo === 'llenar';
    let n = 0;
    const q = (s) => {
      if (s.tipo === 'seccion') return `<div class="fmt-sec">${esc(s.titulo)}</div>`;
      if (s.tipo === 'nota') return `<div class="fmt-nota">${esc(s.titulo)}</div>`;
      n += 1;
      const v = R[s.id] ?? '', id = `fq_${s.id}`, nm = `r_${s.id}`;
      const lab = `<span class="n">${n}.</span>${esc(s.titulo)}${s.requerido && L ? '<span class="req" title="Obligatorio">*</span>' : ''}`;
      const ayuda = s.ayuda ? `<span class="a">${esc(s.ayuda)}</span>` : '';
      if (!L) {
        const t = !v ? 'Sin respuesta' : s.tipo === 'dinero' ? money(v) : s.tipo === 'fecha' ? fechaLarga(v) : s.tipo === 'si_no' ? (v === 'si' ? 'Sí' : 'No') : s.tipo === 'numero' ? Number(v).toLocaleString('es-CO') : v;
        return `<div class="fmt-q"><span class="l">${lab}</span><div class="v ${v ? '' : 'vacio'}">${esc(t)}</div></div>`;
      }
      let inp;
      if (s.tipo === 'parrafo') inp = `<textarea class="form-control" id="${id}" name="${nm}" rows="4">${esc(v)}</textarea>`;
      else if (s.tipo === 'opciones' || s.tipo === 'si_no') {
        const ops = s.tipo === 'si_no' ? [['si', 'Sí'], ['no', 'No']] : s.opciones.map((o) => [o, o]);
        inp = `<div class="fmt-ops" role="radiogroup" aria-labelledby="${id}_l">${ops.map(([ov, ol]) => `<label><input type="radio" name="${nm}" value="${esc(ov)}" ${ov === v ? 'checked' : ''}>${esc(ol)}</label>`).join('')}</div>`;
      } else {
        const type = { fecha: 'date', numero: 'number', dinero: 'number' }[s.tipo] || 'text';
        inp = `<input class="form-control" type="${type}" id="${id}" name="${nm}" value="${esc(v)}" ${type === 'number' ? 'inputmode="numeric" min="0" step="1"' : ''} ${s.tipo === 'dinero' ? 'placeholder="$"' : ''}>`;
      }
      return `<div class="fmt-q"><label for="${id}" id="${id}_l">${lab}</label>${ayuda}${inp}</div>`;
    };
    const fecha = x.enviado_at ? fechaLarga(new Date(x.enviado_at).toISOString()) : fechaLarga(new Date().toISOString());
    return `<div class="fmt-hoja"><div class="fmt-cab">${logoHtml(e)}<div class="fmt-cab-t"><div class="d">${esc(e.distrito)}</div><div class="p">${esc(e.programa)}${e.programa ? ' · ' : ''}Formato oficial</div></div></div>
      <h2 class="fmt-tit">${esc(x.formato_nombre || 'Formato')}</h2>${x.descripcion ? `<p class="fmt-desc">${esc(x.descripcion)}</p>` : ''}
      <div class="fmt-datos"><div><small>Club</small><b>${esc(x.club || e.club || 'Club')}</b></div>
        <div style="grid-column:span 2"><small>Nombre del proyecto</small>${L ? `<input class="form-control" name="titulo" value="${esc(x.titulo || '')}" placeholder="Escribe el nombre del proyecto" required aria-label="Nombre del proyecto">` : `<b>${esc(x.titulo || '')}</b>`}</div>
        <div><small>${x.enviado_at ? 'Fecha de envío' : 'Fecha'}</small><b>${esc(fecha)}</b></div>${x.fecha_limite ? `<div><small>Fecha límite</small><b>${esc(fechaLarga(x.fecha_limite))}</b></div>` : ''}</div>
      ${(x.secciones || []).map(q).join('')}
      <div class="fmt-firma"><div>Presidencia del club</div><div>Responsable del proyecto</div></div>
      <div class="fmt-pie"><span>${esc(e.distrito)}${e.programa ? ` · ${esc(e.programa)}` : ''}</span><span>${esc(x.formato_nombre || '')}</span><span>CD Rotary</span></div></div>`;
  }

  // Lee lo escrito en la hoja
  function leer(root, secciones) {
    const out = {};
    for (const s of secciones) {
      if (!esPregunta(s)) continue;
      const els = root.querySelectorAll(`[name="r_${s.id}"]`);
      const v = (s.tipo === 'opciones' || s.tipo === 'si_no') ? ([...els].find((x) => x.checked)?.value || '') : (els[0]?.value || '').trim();
      if (v) out[s.id] = v;
    }
    return { titulo: root.querySelector('[name="titulo"]')?.value.trim() || '', respuestas: out };
  }
  const autoAlto = (root) => root.querySelectorAll('textarea').forEach((t) => { const f = () => { t.style.height = 'auto'; t.style.height = `${Math.max(110, t.scrollHeight + 4)}px`; }; f(); t.addEventListener('input', f); });

  // Constructor del formato (distrito), en la MISMA hoja que verán los clubes, como un documento (al estilo del editor de Material):
  // se escribe el título, las instrucciones, las secciones, las notas y cada pregunta directo sobre la hoja; la barrita de cada bloque
  // cambia el tipo, obligatoria, clasifica, mover, duplicar y quitar. f = formato o null; cb: guardar(body), borrar(), volver()
  async function constructor(el, f, { plantilla, guardar, borrar, volver }) {
    css();
    const e = await encabezado();
    const st = { nombre: f?.nombre || '', descripcion: f?.descripcion || '', fecha_limite: f?.fecha_limite || '', activo: f ? !!f.activo : true,
      secciones: JSON.parse(JSON.stringify(f?.secciones || plantilla || [])) };
    let sig = st.secciones.length + 1, foco = null;
    const nuevoId = () => { let id; do { id = `s${sig++}`; } while (st.secciones.some((s) => s.id === id)); return id; };
    const ce = (k, v, ph, extra = '') => `<span contenteditable="true" data-k="${k}" data-ph="${esc(ph)}" spellcheck="true" ${extra}>${esc(v || '')}</span>`;
    const insertar = (i) => `<div class="fmt-ins"><span><button type="button" data-add="parrafo" data-en="${i}">+ Pregunta</button><button type="button" data-add="seccion" data-en="${i}">+ Sección</button><button type="button" data-add="nota" data-en="${i}">+ Nota</button></span></div>`;
    const previa = (s) => {
      if (s.tipo === 'parrafo') return '<textarea class="form-control fmt-prev" rows="3" tabindex="-1" aria-hidden="true"></textarea>';
      if (s.tipo === 'si_no') return '<div class="fmt-ops fmt-prev"><label><input type="radio" tabindex="-1">Sí</label><label><input type="radio" tabindex="-1">No</label></div>';
      if (s.tipo === 'opciones') return `<div class="fmt-ops">${(s.opciones || []).map((o, j) => `<span class="fmt-op"><span contenteditable="true" data-op="${j}" data-ph="Opción">${esc(o)}</span><button type="button" data-qop="${j}" aria-label="Quitar opción">×</button></span>`).join('')}<button type="button" class="btn btn-sm btn-link p-0 ms-1" data-aop>+ opción</button></div>`;
      const type = { fecha: 'date', numero: 'number', dinero: 'number' }[s.tipo] || 'text';
      return `<input class="form-control fmt-prev" type="${type}" tabindex="-1" aria-hidden="true" ${s.tipo === 'dinero' ? 'placeholder="$"' : ''}>`;
    };
    const barra = (s, i) => `<div class="fmt-bar" contenteditable="false"><select data-tipo aria-label="Tipo de bloque">${TIPOS.map(([k, l]) => `<option value="${k}" ${k === s.tipo ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${esPregunta(s) ? `<span class="sep"></span><button type="button" data-tg="requerido" class="${s.requerido ? 'act' : ''}" title="El club no puede enviar sin responderla">Obligatoria</button>` : ''}
        ${s.tipo === 'opciones' ? `<button type="button" data-tg="clasifica" class="${s.clasifica ? 'act' : ''}" title="Sus opciones separan los proyectos en Distrito → Impacto">Clasifica</button>` : ''}
        <span class="sep"></span><button type="button" data-mv="-1" aria-label="Subir" ${i ? '' : 'disabled'}><i class="bi bi-arrow-up"></i></button><button type="button" data-mv="1" aria-label="Bajar" ${i < st.secciones.length - 1 ? '' : 'disabled'}><i class="bi bi-arrow-down"></i></button>
        <button type="button" data-dup aria-label="Duplicar"><i class="bi bi-copy"></i></button><button type="button" data-quitar aria-label="Quitar" class="text-danger"><i class="bi bi-trash"></i></button></div>`;
    const bloque = (s, i, n) => {
      let cuerpo;
      if (s.tipo === 'seccion') cuerpo = `<div class="fmt-sec">${ce('titulo', s.titulo, 'Título de la sección')}</div>`;
      else if (s.tipo === 'nota') cuerpo = `<div class="fmt-nota">${ce('titulo', s.titulo, 'Escribe una nota para los clubes: instrucciones, aclaraciones, ejemplos…', 'data-multi="1"')}</div>`;
      else cuerpo = `<div class="fmt-q mb-0"><div class="l"><span class="n">${n}.</span>${ce('titulo', s.titulo, 'Escribe la pregunta')}${s.requerido ? '<span class="req">*</span>' : ''}</div>
        <span class="a">${ce('ayuda', s.ayuda, 'Ayuda para el club (opcional)')}</span>${previa(s)}</div>`;
      return `${insertar(i)}<div class="fmt-b ${foco === i ? 'on' : ''}" data-i="${i}">${barra(s, i)}${cuerpo}</div>`;
    };
    const pintar = () => {
      let n = 0;
      const bloques = st.secciones.map((s, i) => bloque(s, i, esPregunta(s) ? ++n : n)).join('');
      el.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3"><button type="button" class="btn btn-light btn-sm rounded-circle" data-volver aria-label="Volver"><i class="bi bi-arrow-left"></i></button>
          <h2 class="h5 mb-0">${f ? 'Editar formato' : 'Nuevo formato'}</h2><span class="small text-body-secondary d-none d-md-inline ms-2">Escribe directo en la hoja: así la verán los clubes</span>
          <span class="ms-auto d-flex gap-2">${f && borrar ? '<button type="button" class="btn btn-outline-danger btn-sm" data-borrar><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}<button type="button" class="btn btn-primary" data-guardar><i class="bi bi-check-lg me-1"></i>Guardar</button></span></div>
        <div class="fmt-ctl"><label class="small fw-semibold mb-0" for="fm_f">Fecha límite</label><input type="date" class="form-control form-control-sm w-auto" id="fm_f" data-g="fecha_limite" value="${esc(st.fecha_limite)}">
          <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="fm_a" data-g="activo" ${st.activo ? 'checked' : ''}><label class="form-check-label small" for="fm_a">Disponible para los clubes</label></div>
          <span class="ms-auto d-flex gap-1">${plantilla ? '<button type="button" class="btn btn-sm btn-light" data-plantilla title="Reemplaza las preguntas por la plantilla sugerida"><i class="bi bi-magic me-1"></i>Plantilla sugerida</button>' : ''}</span>
          <div class="small text-danger w-100" data-err></div></div>
        <div class="fmt-fondo"><div class="fmt-hoja fmt-hoja--ed"><div class="fmt-cab">${logoHtml(e)}<div class="fmt-cab-t"><div class="d">${esc(e.distrito)}</div><div class="p">${esc(e.programa)}${e.programa ? ' · ' : ''}Formato oficial</div></div></div>
          <h2 class="fmt-tit"><span contenteditable="true" data-g="nombre" data-ph="Nombre del formato">${esc(st.nombre)}</span></h2>
          <p class="fmt-desc"><span contenteditable="true" data-g="descripcion" data-multi="1" data-ph="Instrucciones para los clubes (opcional): qué deben presentar y cómo se revisa">${esc(st.descripcion)}</span></p>
          <div class="fmt-datos fmt-prev"><div><small>Club</small><b>Nombre del club</b></div><div style="grid-column:span 2"><small>Nombre del proyecto</small><b>Lo escribe el club</b></div><div><small>Fecha</small><b>${esc(fechaLarga(new Date().toISOString()))}</b></div></div>
          ${bloques}
          <div class="fmt-add"><span class="small text-body-secondary w-100 text-center">Agregar al final</span><button type="button" data-add="parrafo" data-en="${st.secciones.length}"><i class="bi bi-plus-lg me-1"></i>Pregunta</button><button type="button" data-add="seccion" data-en="${st.secciones.length}"><i class="bi bi-type-h2 me-1"></i>Sección</button><button type="button" data-add="nota" data-en="${st.secciones.length}"><i class="bi bi-sticky me-1"></i>Nota</button><button type="button" data-add="opciones" data-en="${st.secciones.length}"><i class="bi bi-ui-radios me-1"></i>Elegir una opción</button></div>
          <div class="fmt-firma fmt-prev"><div>Presidencia del club</div><div>Responsable del proyecto</div></div>
          <div class="fmt-pie"><span>${esc(e.distrito)}</span><span>${esc(st.nombre || '')}</span><span>CD Rotary</span></div></div></div>`;
    };
    const enfocar = (i, k = 'titulo') => { const x = el.querySelector(`[data-i="${i}"] [data-k="${k}"]`); if (x) { x.focus(); const r = document.createRange(); r.selectNodeContents(x); r.collapse(false); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); } };
    pintar();
    const texto = (x) => (x.dataset.multi ? x.innerText.replace(/\n{3,}/g, '\n\n') : x.innerText.replace(/\s*\n\s*/g, ' ')).trim();
    el.oninput = (ev) => {
      const x = ev.target;
      if (x.dataset.g) { st[x.dataset.g] = x.type === 'checkbox' ? x.checked : x.isContentEditable ? texto(x) : x.value; if (x.dataset.g === 'nombre') { const pie = el.querySelector('.fmt-pie span:nth-child(2)'); if (pie) pie.textContent = st.nombre; } return; }
      const b = x.closest('[data-i]'); if (!b) return;
      const s = st.secciones[+b.dataset.i];
      if (x.dataset.k) s[x.dataset.k] = texto(x);
      else if (x.dataset.op != null) s.opciones[+x.dataset.op] = texto(x);
    };
    // Un solo juego de oyentes por contenedor (se reemplazan al volver a abrir el constructor)
    if (el._fmtOff) el._fmtOff();
    const onFocus = (ev) => { const b = ev.target.closest?.('[data-i]'); const i = b ? +b.dataset.i : null; if (i === foco) return; el.querySelectorAll('.fmt-b.on').forEach((y) => y.classList.remove('on')); foco = i; b?.classList.add('on'); };
    el.onkeydown = (ev) => {
      const x = ev.target; if (!x.isContentEditable || ev.key !== 'Enter' || x.dataset.multi) return;
      ev.preventDefault();
      const b = x.closest('[data-i]');
      if (x.dataset.op != null) { const s = st.secciones[+b.dataset.i]; s.opciones.splice(+x.dataset.op + 1, 0, ''); pintar(); el.querySelector(`[data-i="${b.dataset.i}"] [data-op="${+x.dataset.op + 1}"]`)?.focus(); return; }
      if (x.dataset.k === 'titulo' && b && esPregunta(st.secciones[+b.dataset.i])) return enfocar(+b.dataset.i, 'ayuda');
      if (b) { const i = +b.dataset.i + 1; st.secciones.splice(i, 0, { id: nuevoId(), tipo: 'parrafo', titulo: '', ayuda: '', requerido: false }); foco = i; pintar(); enfocar(i); }
    };
    const onPaste = (ev) => { if (!ev.target.isContentEditable) return; ev.preventDefault(); document.execCommand('insertText', false, (ev.clipboardData || window.clipboardData).getData('text/plain')); };
    el.addEventListener('focusin', onFocus); el.addEventListener('paste', onPaste);
    el._fmtOff = () => { el.removeEventListener('focusin', onFocus); el.removeEventListener('paste', onPaste); el.onkeydown = null; el._fmtOff = null; };
    el.onchange = (ev) => {
      if (ev.target.dataset.tipo == null) return;
      const s = st.secciones[+ev.target.closest('[data-i]').dataset.i]; s.tipo = ev.target.value;
      if (s.tipo === 'opciones' && !s.opciones?.length) s.opciones = ['Opción 1', 'Opción 2'];
      if (!esPregunta(s)) { s.requerido = false; s.ayuda = ''; }
      if (s.tipo !== 'opciones') delete s.clasifica;
      pintar();
    };
    el.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.volver != null) return volver();
      const fila = b.closest('[data-i]'), i = fila ? +fila.dataset.i : null, s = fila ? st.secciones[i] : null;
      if (b.dataset.add) {
        const en = Number(b.dataset.en), tipo = b.dataset.add;
        st.secciones.splice(en, 0, { id: nuevoId(), tipo, titulo: '', ayuda: '', requerido: false, ...(tipo === 'opciones' ? { opciones: ['Opción 1', 'Opción 2'] } : {}) });
        foco = en; pintar(); enfocar(en); return;
      }
      if (b.dataset.plantilla != null) { if (st.secciones.length && !(await window.App.confirm({ title: '¿Usar la plantilla sugerida?', text: 'Reemplaza las preguntas que tienes ahora.', ok: 'Usar' }))) return; st.secciones = JSON.parse(JSON.stringify(plantilla)); sig = st.secciones.length + 1; return pintar(); }
      if (s && b.dataset.tg) { s[b.dataset.tg] = !s[b.dataset.tg]; return pintar(); }
      if (s && b.dataset.mv) { const j = i + Number(b.dataset.mv); [st.secciones[i], st.secciones[j]] = [st.secciones[j], st.secciones[i]]; foco = j; return pintar(); }
      if (s && b.dataset.dup != null) { st.secciones.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(s)), id: nuevoId() }); foco = i + 1; return pintar(); }
      if (s && b.dataset.quitar != null) { st.secciones.splice(i, 1); foco = null; return pintar(); }
      if (s && b.dataset.aop != null) { s.opciones.push(''); pintar(); el.querySelector(`[data-i="${i}"] [data-op="${s.opciones.length - 1}"]`)?.focus(); return; }
      if (s && b.dataset.qop != null) { s.opciones.splice(+b.dataset.qop, 1); return pintar(); }
      if (b.dataset.borrar != null) { if (!(await window.App.confirm({ title: '¿Borrar este formato?', ok: 'Borrar' }))) return; try { await borrar(); } catch (x) { el.querySelector('[data-err]').textContent = x.message; } return; }
      if (b.dataset.guardar != null) {
        b.disabled = true;
        try { await guardar({ nombre: st.nombre.trim(), descripcion: st.descripcion.trim(), fecha_limite: st.fecha_limite || null, activo: st.activo, secciones: st.secciones.map((x) => ({ ...x, opciones: Array.isArray(x.opciones) ? x.opciones.map((o) => o.trim()).filter(Boolean) : x.opciones })) }); }
        catch (x) { el.querySelector('[data-err]').textContent = x.message; window.App.toast(x.message, false); } finally { b.disabled = false; }
      }
    };
  }

  function imprimir() { window.print(); }

  return { hoja, leer, autoAlto, constructor, encabezado, chip, EST, imprimir, css, fechaLarga };
})();
