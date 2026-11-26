// Formatos del distrito (window.ROFmt): la hoja formal (encabezado del distrito con su logo, datos, secciones numeradas) para
// llenar (club) o leer (distrito / ya enviada) y el constructor de formatos del distrito. Todo en la página, sin ventanas.
window.ROFmt = (function () {
  const { api, esc } = window.App;
  const TIPOS = [['parrafo', 'Párrafo (texto largo)', 'bi-text-paragraph'], ['texto', 'Respuesta corta', 'bi-input-cursor-text'], ['numero', 'Número', 'bi-123'], ['dinero', 'Dinero', 'bi-cash'],
    ['fecha', 'Fecha', 'bi-calendar-event'], ['opciones', 'Elegir una opción', 'bi-ui-radios'], ['si_no', 'Sí / No', 'bi-toggle-on'], ['seccion', 'Título de sección', 'bi-type-h2']];
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
      if (s.tipo === 'seccion') continue;
      const els = root.querySelectorAll(`[name="r_${s.id}"]`);
      const v = (s.tipo === 'opciones' || s.tipo === 'si_no') ? ([...els].find((x) => x.checked)?.value || '') : (els[0]?.value || '').trim();
      if (v) out[s.id] = v;
    }
    return { titulo: root.querySelector('[name="titulo"]')?.value.trim() || '', respuestas: out };
  }
  const autoAlto = (root) => root.querySelectorAll('textarea').forEach((t) => { const f = () => { t.style.height = 'auto'; t.style.height = `${Math.max(110, t.scrollHeight + 4)}px`; }; f(); t.addEventListener('input', f); });

  // Constructor del formato (distrito). f = formato o null; plantilla = secciones sugeridas. Pinta en «el»; cb: guardar(body), borrar(), volver()
  async function constructor(el, f, { plantilla, guardar, borrar, volver }) {
    css();
    const e = await encabezado();
    const st = { nombre: f?.nombre || '', descripcion: f?.descripcion || '', fecha_limite: f?.fecha_limite || '', activo: f ? !!f.activo : true,
      secciones: JSON.parse(JSON.stringify(f?.secciones || plantilla || [])) };
    let sig = st.secciones.length + 1;
    const nuevoId = () => { let id; do { id = `s${sig++}`; } while (st.secciones.some((s) => s.id === id)); return id; };
    const opTipos = (t) => TIPOS.map(([k, l]) => `<option value="${k}" ${k === t ? 'selected' : ''}>${l}</option>`).join('');
    const filaHtml = (s, i) => `<div class="fmt-ed-s ${s.tipo === 'seccion' ? 'sec' : ''}" data-i="${i}">
        <div class="d-flex gap-2 align-items-center mb-2"><select class="form-select form-select-sm w-auto" data-k="tipo" aria-label="Tipo">${opTipos(s.tipo)}</select>
          ${s.tipo === 'seccion' ? '' : `<div class="form-check form-switch small mb-0"><input class="form-check-input" type="checkbox" data-k="requerido" id="rq${i}" ${s.requerido ? 'checked' : ''}><label class="form-check-label" for="rq${i}">Obligatoria</label></div>`}
          <span class="ms-auto btn-group btn-group-sm"><button type="button" class="btn btn-light" data-mv="-1" aria-label="Subir" ${i ? '' : 'disabled'}><i class="bi bi-arrow-up"></i></button><button type="button" class="btn btn-light" data-mv="1" aria-label="Bajar" ${i < st.secciones.length - 1 ? '' : 'disabled'}><i class="bi bi-arrow-down"></i></button><button type="button" class="btn btn-light text-danger" data-quitar aria-label="Quitar"><i class="bi bi-trash"></i></button></span></div>
        <input class="form-control form-control-sm ${s.tipo === 'seccion' ? 'fw-bold' : 'fw-semibold'} mb-1" data-k="titulo" value="${esc(s.titulo)}" placeholder="${s.tipo === 'seccion' ? 'Título de la sección' : 'Pregunta'}" aria-label="Título">
        ${s.tipo === 'seccion' ? '' : `<input class="form-control form-control-sm" data-k="ayuda" value="${esc(s.ayuda || '')}" placeholder="Ayuda para el club (opcional)" aria-label="Ayuda">`}
        ${s.tipo === 'opciones' ? `<textarea class="form-control form-control-sm mt-1" data-k="opciones" rows="3" placeholder="Una opción por línea" aria-label="Opciones">${esc((s.opciones || []).join('\n'))}</textarea>` : ''}</div>`;
    el.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3"><button type="button" class="btn btn-light btn-sm rounded-circle" data-volver aria-label="Volver"><i class="bi bi-arrow-left"></i></button>
        <h2 class="h5 mb-0">${f ? 'Editar formato' : 'Nuevo formato'}</h2><span class="ms-auto d-flex gap-2">${f && borrar ? '<button type="button" class="btn btn-outline-danger btn-sm" data-borrar><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}<button type="button" class="btn btn-primary" data-guardar><i class="bi bi-check-lg me-1"></i>Guardar formato</button></span></div>
      <div class="row g-3"><div class="col-lg-5"><div class="dw-card">
          <label class="form-label small fw-semibold mb-1" for="fm_n">Nombre del formato</label><input class="form-control mb-2" id="fm_n" data-g="nombre" value="${esc(st.nombre)}" placeholder="p. ej. Presentación de proyectos de servicio">
          <label class="form-label small fw-semibold mb-1" for="fm_d">Instrucciones para los clubes</label><textarea class="form-control mb-2" id="fm_d" data-g="descripcion" rows="2" placeholder="Qué deben presentar y cómo se revisa">${esc(st.descripcion)}</textarea>
          <div class="row g-2 align-items-end mb-1"><div class="col-6"><label class="form-label small fw-semibold mb-1" for="fm_f">Fecha límite (opcional)</label><input type="date" class="form-control" id="fm_f" data-g="fecha_limite" value="${esc(st.fecha_limite)}"></div>
            <div class="col-6"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="fm_a" data-g="activo" ${st.activo ? 'checked' : ''}><label class="form-check-label small" for="fm_a">Disponible para los clubes</label></div></div></div>
          <div class="small text-danger" data-err></div></div>
        <div class="d-flex align-items-center gap-2 mt-3 mb-2"><b class="small text-uppercase text-body-secondary">Secciones y preguntas</b><span class="ms-auto d-flex gap-1">
          ${plantilla ? '<button type="button" class="btn btn-sm btn-light" data-plantilla title="Reemplaza las preguntas por la plantilla sugerida"><i class="bi bi-magic me-1"></i>Sugerida</button>' : ''}</span></div>
        <div class="fmt-ed" data-lista></div>
        <div class="d-flex gap-2 mt-2"><button type="button" class="btn btn-outline-primary btn-sm" data-add="parrafo"><i class="bi bi-plus-lg me-1"></i>Pregunta</button><button type="button" class="btn btn-outline-secondary btn-sm" data-add="seccion"><i class="bi bi-type-h2 me-1"></i>Sección</button></div></div>
        <div class="col-lg-7"><div class="small text-body-secondary mb-1"><i class="bi bi-eye me-1"></i>Así lo verán los clubes</div><div class="fmt-fondo" style="position:sticky;top:76px;max-height:calc(100vh - 96px);overflow:auto" data-prev></div></div></div>`;
    const lista = el.querySelector('[data-lista]'), prev = el.querySelector('[data-prev]');
    const pintarPrev = () => { prev.innerHTML = hoja(e, { formato_nombre: st.nombre || 'Nombre del formato', descripcion: st.descripcion, secciones: st.secciones.filter((s) => s.titulo), fecha_limite: st.fecha_limite, club: 'Club de ejemplo' }, 'llenar'); prev.querySelectorAll('input,textarea,select').forEach((x) => { x.tabIndex = -1; }); };
    const pintarLista = () => { lista.innerHTML = st.secciones.length ? st.secciones.map(filaHtml).join('') : '<div class="small text-body-secondary">Agrega preguntas o usa la plantilla sugerida.</div>'; pintarPrev(); };
    pintarLista();
    el.oninput = (ev) => {
      const g = ev.target.dataset.g; if (g) { st[g] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value; return pintarPrev(); }
      const fila = ev.target.closest('[data-i]'), k = ev.target.dataset.k; if (!fila || !k || k === 'tipo') return;
      const s = st.secciones[+fila.dataset.i];
      s[k] = ev.target.type === 'checkbox' ? ev.target.checked : k === 'opciones' ? ev.target.value.split('\n') : ev.target.value;
      pintarPrev();
    };
    el.onchange = (ev) => {
      if (ev.target.dataset.k !== 'tipo') return;
      const s = st.secciones[+ev.target.closest('[data-i]').dataset.i]; s.tipo = ev.target.value;
      if (s.tipo === 'opciones' && !s.opciones?.length) s.opciones = ['Opción 1', 'Opción 2'];
      if (s.tipo === 'seccion') s.requerido = false;
      pintarLista();
    };
    el.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.volver != null) return volver();
      if (b.dataset.add) { st.secciones.push({ id: nuevoId(), tipo: b.dataset.add, titulo: '', ayuda: '', requerido: false }); pintarLista(); lista.lastElementChild?.querySelector('[data-k="titulo"]')?.focus(); return; }
      if (b.dataset.plantilla != null) { if (st.secciones.length && !(await window.App.confirm({ title: '¿Usar la plantilla sugerida?', text: 'Reemplaza las preguntas que tienes ahora.', ok: 'Usar' }))) return; st.secciones = JSON.parse(JSON.stringify(plantilla)); sig = st.secciones.length + 1; return pintarLista(); }
      const fila = b.closest('[data-i]');
      if (fila && b.dataset.mv) { const i = +fila.dataset.i, j = i + Number(b.dataset.mv); [st.secciones[i], st.secciones[j]] = [st.secciones[j], st.secciones[i]]; return pintarLista(); }
      if (fila && b.dataset.quitar != null) { st.secciones.splice(+fila.dataset.i, 1); return pintarLista(); }
      if (b.dataset.borrar != null) { if (!(await window.App.confirm({ title: '¿Borrar este formato?', ok: 'Borrar' }))) return; try { await borrar(); } catch (x) { el.querySelector('[data-err]').textContent = x.message; } return; }
      if (b.dataset.guardar != null) {
        b.disabled = true;
        try { await guardar({ nombre: st.nombre.trim(), descripcion: st.descripcion.trim(), fecha_limite: st.fecha_limite || null, activo: st.activo, secciones: st.secciones.map((s) => ({ ...s, opciones: Array.isArray(s.opciones) ? s.opciones.map((o) => o.trim()).filter(Boolean) : s.opciones })) }); }
        catch (x) { el.querySelector('[data-err]').textContent = x.message; window.App.toast(x.message, false); } finally { b.disabled = false; }
      }
    };
  }

  function imprimir() { window.print(); }

  return { hoja, leer, autoAlto, constructor, encabezado, chip, EST, imprimir, css, fechaLarga };
})();
