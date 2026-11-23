// Encuestas de una comunidad (Impacto → Comunidades → una comunidad → Encuestas).
// Crear: con IA (se describe qué se busca) o desde una plantilla, y se ajusta en el editor. Responder: un socio la llena con
// cada beneficiario («Guardar y seguir» pasa al siguiente). Resultados: gráficas por pregunta, puntaje por tema (las de
// conocimiento), buscar y filtrar respuestas, y descargar CSV.
//   ROEnc.montar(el, { comunidad, beneficiarios, M, W, alCambiar })
window.ROEnc = (function () {
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud;
  const TIPO = { caracterizacion: ['bi-person-vcard', 'Caracterización'], conocimiento: ['bi-mortarboard', 'Conocimientos (con puntaje)'], satisfaccion: ['bi-emoji-smile', 'Satisfacción'], otra: ['bi-ui-checks', 'Otra'] };
  const TP = { unica: 'Una opción', multiple: 'Varias opciones', si_no: 'Sí / No', escala: 'Escala 1 a 5', numero: 'Número', texto: 'Texto libre' };
  const EJEMPLOS = ['Caracterización de las familias: hogar, salud, educación, ingresos y necesidades', '¿Cuánto saben los adultos de salud emocional y de economía del hogar? Con puntaje por tema',
    'Satisfacción de los niños con la jornada de recreación', 'Hábitos de alimentación y nutrición de los niños de 5 a 12 años'];
  const uid = () => Math.random().toString(36).slice(2, 9);
  const opcionesDe = (q) => (q.tipo === 'si_no' ? ['Sí', 'No'] : q.tipo === 'escala' ? ['1', '2', '3', '4', '5'] : q.opciones || []);
  const porTema = (qs) => qs.reduce((m, q) => { const t = q.tema || 'General'; (m[t] ||= []).push(q); return m; }, {});
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const barraH = (label, n, total, color = 'var(--dw-p)', extra = '') => `<div class="mb-1"><div class="d-flex justify-content-between small gap-2"><span class="min-w-0">${label}</span><span class="text-nowrap">${n} · ${pct(n, total)}%${extra}</span></div>
    <div class="progress" style="height:8px"><div class="progress-bar" style="width:${pct(n, total)}%;background:${color}"></div></div></div>`;

  /* ---------- editor de la encuesta ---------- */
  function editor(enc, { comunidad, alGuardar }) {
    const e = structuredClone(enc);
    e.preguntas = (e.preguntas || []).map((q) => ({ ...q, id: q.id || uid(), opciones: opcionesDe(q) }));
    const { el, m } = modal(`<form><div class="modal-header"><h2 class="modal-title h5">${e.id ? 'Editar encuesta' : 'Nueva encuesta'}${e.con_ia && !e.id ? ' <span class="badge text-bg-primary align-middle"><i class="bi bi-stars me-1"></i>creada con IA</span>' : ''}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body d-grid gap-3">
        <div class="row g-2"><div class="col-md-8"><label class="form-label small mb-1">Título</label><input class="form-control" name="titulo" required maxlength="200" value="${esc(e.titulo || '')}"></div>
          <div class="col-md-4"><label class="form-label small mb-1">Tipo</label><select class="form-select" name="tipo">${Object.entries(TIPO).map(([k, [, l]]) => `<option value="${k}" ${e.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="col-md-8"><label class="form-label small mb-1">¿Qué buscamos saber?</label><input class="form-control" name="objetivo" value="${esc(e.objetivo || '')}"></div>
          <div class="col-md-4"><label class="form-label small mb-1">Estado</label><select class="form-select" name="estado">${[['activa', 'Activa'], ['borrador', 'Borrador'], ['cerrada', 'Cerrada']].map(([k, l]) => `<option value="${k}" ${(e.estado || 'activa') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="col-12 form-check ms-1"><input class="form-check-input" type="checkbox" id="enc-todas" name="todas" ${e.id && !e.comunidad_id ? 'checked' : ''}><label class="form-check-label small" for="enc-todas">Usarla en todas las comunidades (si no, solo en ${esc(comunidad.nombre)})</label></div></div>
        <div data-preguntas class="d-grid gap-2"></div>
        <div><button type="button" class="btn btn-outline-primary btn-sm" data-qmas><i class="bi bi-plus-lg me-1"></i>Pregunta</button></div>
      </div><div class="modal-footer justify-content-between"><span class="small text-body-secondary" data-cuenta></span><span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar encuesta</button></span></div></form>`, { size: 'modal-xl' });
    const f = el.querySelector('form'), host = el.querySelector('[data-preguntas]');
    const conoc = () => f.tipo.value === 'conocimiento';
    const pintar = () => {
      host.innerHTML = e.preguntas.map((q, k) => {
        const ops = opcionesDe(q), cor = q.correcta || [];
        return `<div class="ro-encq" data-k="${k}"><div class="d-flex gap-2 align-items-start">
          <span class="badge text-bg-light mt-2">${k + 1}</span>
          <div class="flex-grow-1 d-grid gap-2"><div class="row g-2"><div class="col-md-3"><input class="form-control form-control-sm" data-f="tema" value="${esc(q.tema || '')}" placeholder="Tema (sección)" aria-label="Tema"></div>
              <div class="col-md-6"><input class="form-control form-control-sm" data-f="texto" value="${esc(q.texto || '')}" placeholder="Pregunta" aria-label="Pregunta"></div>
              <div class="col-md-3"><select class="form-select form-select-sm" data-f="tipo" aria-label="Tipo de respuesta">${Object.entries(TP).map(([t, l]) => `<option value="${t}" ${q.tipo === t ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
            ${['unica', 'multiple'].includes(q.tipo) ? `<textarea class="form-control form-control-sm" rows="${Math.max(2, ops.length)}" data-f="opciones" placeholder="Una opción por línea">${esc(ops.join('\n'))}</textarea>` : ''}
            ${conoc() && ['unica', 'multiple', 'si_no'].includes(q.tipo) && ops.length ? `<div class="small d-flex flex-wrap gap-2 align-items-center"><span class="text-success"><i class="bi bi-check2-circle"></i> Correcta:</span>
              ${ops.map((o, i) => `<label class="d-inline-flex gap-1 align-items-center"><input type="${q.tipo === 'multiple' ? 'checkbox' : 'radio'}" name="cor${k}" data-cor="${i}" ${cor.includes(i) ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div>` : ''}</div>
          <div class="btn-group-vertical btn-group-sm"><button type="button" class="btn btn-light" data-up aria-label="Subir"><i class="bi bi-arrow-up"></i></button><button type="button" class="btn btn-light" data-down aria-label="Bajar"><i class="bi bi-arrow-down"></i></button><button type="button" class="btn btn-light" data-del aria-label="Quitar"><i class="bi bi-trash"></i></button></div></div></div>`;
      }).join('') || '<p class="small text-body-secondary mb-0">Sin preguntas todavía.</p>';
      el.querySelector('[data-cuenta]').textContent = `${e.preguntas.length} preguntas · ${Object.keys(porTema(e.preguntas)).length} temas`;
    };
    pintar();
    f.tipo.addEventListener('change', pintar);
    host.addEventListener('input', (ev) => {
      const box = ev.target.closest('[data-k]'), fld = ev.target.dataset.f; if (!box || !fld) return;
      const q = e.preguntas[+box.dataset.k];
      if (fld === 'opciones') q.opciones = ev.target.value.split('\n').map((x) => x.trim()).filter(Boolean);
      else if (fld !== 'tipo') q[fld] = ev.target.value;
    });
    host.addEventListener('change', (ev) => {
      const box = ev.target.closest('[data-k]'); if (!box) return; const q = e.preguntas[+box.dataset.k];
      if (ev.target.dataset.f === 'tipo') { q.tipo = ev.target.value; q.opciones = opcionesDe({ ...q, opciones: ['unica', 'multiple'].includes(q.tipo) ? (q.opciones?.length >= 2 && !['Sí', '1'].includes(q.opciones[0]) ? q.opciones : ['Opción 1', 'Opción 2']) : [] }); delete q.correcta; pintar(); }
      else if (ev.target.dataset.f === 'opciones') { delete q.correcta; pintar(); }
      else if (ev.target.dataset.cor != null) q.correcta = [...box.querySelectorAll('[data-cor]')].filter((x) => x.checked).map((x) => +x.dataset.cor);
    });
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-qmas]')) { e.preguntas.push({ id: uid(), tema: e.preguntas.at(-1)?.tema || '', texto: '', tipo: 'unica', opciones: ['Opción 1', 'Opción 2'] }); pintar(); host.querySelector('[data-k]:last-child [data-f="texto"]')?.focus(); return; }
      const box = ev.target.closest('[data-k]'); if (!box) return; const k = +box.dataset.k;
      if (ev.target.closest('[data-up]') && k > 0) { [e.preguntas[k - 1], e.preguntas[k]] = [e.preguntas[k], e.preguntas[k - 1]]; pintar(); }
      else if (ev.target.closest('[data-down]') && k < e.preguntas.length - 1) { [e.preguntas[k + 1], e.preguntas[k]] = [e.preguntas[k], e.preguntas[k + 1]]; pintar(); }
      else if (ev.target.closest('[data-del]')) { e.preguntas.splice(k, 1); pintar(); }
    });
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const preguntas = e.preguntas.filter((q) => String(q.texto || '').trim()).map((q) => ({ ...q, opciones: ['unica', 'multiple'].includes(q.tipo) ? q.opciones : undefined, correcta: conoc() ? q.correcta : undefined }));
      if (!preguntas.length) { toast('Agrega al menos una pregunta', false); return; }
      const body = { titulo: f.titulo.value.trim(), objetivo: f.objetivo.value.trim(), tipo: f.tipo.value, estado: f.estado.value, comunidad_id: f.todas.checked ? null : comunidad.id, preguntas, con_ia: e.con_ia ? 1 : 0 };
      try { const r = await api(e.id ? `/api/impacto/encuestas/${e.id}` : '/api/impacto/encuestas', { method: e.id ? 'PATCH' : 'POST', body }); m.hide(); toast('Encuesta guardada'); alGuardar?.(e.id || r.id); } catch (x) { toast(x.message, false); }
    };
  }

  /* ---------- nueva: con IA o desde plantilla ---------- */
  async function nueva(ctx) {
    const { el, m } = modal(`<div class="modal-header"><h2 class="modal-title h5">Nueva encuesta para ${esc(ctx.comunidad.nombre)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body d-grid gap-3">
        <form class="ro-enc-ia d-grid gap-2" data-ia><b><i class="bi bi-stars me-1"></i>Crear con IA</b>
          <label class="small text-body-secondary" for="enc-pedido">Cuéntale qué quieres saber, de quién y para qué. La IA arma las preguntas por temas y tú las ajustas antes de guardar.</label>
          <textarea class="form-control" id="enc-pedido" name="pedido" rows="3" required minlength="5" placeholder="p. ej. Quiero saber cuánto saben los papás de salud emocional y de manejo del dinero, con un puntaje por tema"></textarea>
          <div class="d-flex flex-wrap gap-1">${EJEMPLOS.map((x) => `<button type="button" class="btn btn-sm btn-light rounded-pill" data-ej>${esc(x)}</button>`).join('')}</div>
          <div class="d-flex gap-2 align-items-center flex-wrap"><select class="form-select form-select-sm w-auto" name="tipo" aria-label="Tipo"><option value="">Que la IA elija el tipo</option>${Object.entries(TIPO).map(([k, [, l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
            <button class="btn btn-primary btn-sm ms-auto" data-generar><i class="bi bi-stars me-1"></i>Crear con IA</button></div></form>
        <div><b class="d-block mb-2">O empieza con una plantilla</b><div class="d-grid gap-2" data-plant><span class="small text-body-secondary">Cargando…</span></div></div>
        <div><button class="btn btn-sm btn-link px-0" data-blanco>Empezar en blanco</button></div>
      </div>`, { size: 'modal-lg' });
    const abrirEditor = (enc) => { m.hide(); editor(enc, { comunidad: ctx.comunidad, alGuardar: ctx.alCambiar }); };
    const pl = await api('/api/impacto/encuestas/plantillas').then((x) => x.rows).catch(() => []);
    el.querySelector('[data-plant]').innerHTML = pl.map((p, i) => `<button class="btn btn-outline-secondary text-start" data-pl="${i}"><i class="bi ${TIPO[p.tipo]?.[0] || 'bi-ui-checks'} me-2"></i><b>${esc(p.titulo)}</b><div class="small text-body-secondary">${esc(p.objetivo)} · ${p.preguntas.length} preguntas</div></button>`).join('');
    el.addEventListener('click', (ev) => {
      const ej = ev.target.closest('[data-ej]'); if (ej) { el.querySelector('[name=pedido]').value = ej.textContent; return; }
      const b = ev.target.closest('[data-pl]'); if (b) { const p = pl[+b.dataset.pl]; return abrirEditor({ titulo: p.titulo, objetivo: p.objetivo, tipo: p.tipo, preguntas: p.preguntas, estado: 'activa' }); }
      if (ev.target.closest('[data-blanco]')) abrirEditor({ titulo: '', tipo: 'caracterizacion', estado: 'activa', preguntas: [{ id: uid(), tema: '', texto: '', tipo: 'unica', opciones: ['Opción 1', 'Opción 2'] }] });
    });
    el.querySelector('[data-ia]').onsubmit = async (ev) => {
      ev.preventDefault(); const f = ev.target, btn = f.querySelector('[data-generar]');
      btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creando…';
      try { const r = await api('/api/impacto/encuestas/generar', { method: 'POST', body: { pedido: f.pedido.value.trim(), tipo: f.tipo.value || null, comunidad_id: ctx.comunidad.id } }); abrirEditor({ ...r, estado: 'activa', con_ia: 1 }); }
      catch (x) { toast(x.message, false); btn.disabled = false; btn.innerHTML = '<i class="bi bi-stars me-1"></i>Crear con IA'; }
    };
  }

  /* ---------- responder con un beneficiario ---------- */
  function campo(q, v) {
    const n = `q_${q.id}`, ops = opcionesDe(q);
    if (q.tipo === 'texto') return `<textarea class="form-control" name="${n}" rows="2">${esc(v ?? '')}</textarea>`;
    if (q.tipo === 'numero') return `<input class="form-control" style="max-width:180px" type="number" step="any" name="${n}" value="${v ?? ''}">`;
    const multi = q.tipo === 'multiple', inline = ['si_no', 'escala'].includes(q.tipo);
    return `<div class="${inline ? 'd-flex flex-wrap gap-2' : 'd-grid gap-1'}">${ops.map((o, i) => `<label class="ro-encop"><input type="${multi ? 'checkbox' : 'radio'}" name="${n}" value="${i}" ${(multi ? (v || []).includes(i) : v === i) ? 'checked' : ''}> <span>${esc(o)}</span></label>`).join('')}</div>`;
  }
  function responder(enc, ctx, previa = null) {
    const bens = ctx.beneficiarios || [];
    const hechos = new Set(ctx.respondidos || []);
    const temas = porTema(enc.preguntas);
    const { el, m } = modal(`<form><div class="modal-header"><div class="min-w-0"><h2 class="modal-title h5 text-truncate">${esc(enc.titulo)}</h2><div class="small text-body-secondary">${esc(enc.objetivo || '')}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body d-grid gap-3">
        <div class="row g-2"><div class="col-md-8"><label class="form-label small mb-1">Beneficiario</label><select class="form-select" name="beneficiario_id" required ${previa ? 'disabled' : ''}><option value="">Elige a quién se le hace…</option>
            ${bens.map((b) => `<option value="${b.id}" ${previa?.beneficiario_id === b.id ? 'selected' : ''}>${esc(b.nombre)}${hechos.has(b.id) ? ' ✓' : ''}</option>`).join('')}</select>
            <div class="form-text">${bens.length - hechos.size > 0 ? `Faltan ${bens.length - [...hechos].filter((id) => bens.some((b) => b.id === id)).length} de ${bens.length} beneficiarios (✓ = ya respondió)` : 'Todos los beneficiarios ya respondieron.'}</div></div>
          <div class="col-md-4"><label class="form-label small mb-1">Fecha</label><input class="form-control" type="date" name="fecha" value="${previa?.fecha || C.todayCo()}"></div></div>
        <div data-resultado></div>
        ${Object.entries(temas).map(([t, qs]) => `<fieldset class="ro-enct"><legend class="h6">${esc(t)}</legend>${qs.map((q) => `<div class="mb-3"><div class="fw-semibold small mb-1">${esc(q.texto)}${q.obligatoria ? ' <span class="text-danger">*</span>' : ''}</div>${campo(q, previa?.respuestas?.[q.id])}</div>`).join('')}</fieldset>`).join('')}
      </div><div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cerrar</button>${previa ? '' : '<button type="button" class="btn btn-outline-primary" data-seguir>Guardar y seguir con otro</button>'}<button class="btn btn-primary">Guardar</button></div></form>`, { size: 'modal-lg' });
    const f = el.querySelector('form');
    const leer = () => Object.fromEntries(enc.preguntas.map((q) => {
      const n = `q_${q.id}`;
      if (q.tipo === 'multiple') return [q.id, [...f.querySelectorAll(`[name="${n}"]:checked`)].map((x) => +x.value)];
      if (['unica', 'si_no', 'escala'].includes(q.tipo)) { const x = f.querySelector(`[name="${n}"]:checked`); return [q.id, x ? +x.value : null]; }
      return [q.id, f[n]?.value ?? ''];
    }));
    const guardar = async (seguir) => {
      if (!previa && !f.beneficiario_id.value) { toast('Elige el beneficiario', false); f.beneficiario_id.focus(); return; }
      try {
        const r = previa ? await api(`/api/impacto/respuestas/${previa.id}`, { method: 'PATCH', body: { fecha: f.fecha.value, respuestas: leer() } })
          : await api(`/api/impacto/encuestas/${enc.id}/respuestas`, { method: 'POST', body: { beneficiario_id: Number(f.beneficiario_id.value), fecha: f.fecha.value, respuestas: leer() } });
        const nombre = previa?.beneficiario || f.beneficiario_id.selectedOptions[0]?.textContent.replace(' ✓', '');
        const msg = r.max ? `${nombre}: ${r.puntaje} de ${r.max} (${pct(r.puntaje, r.max)}%)` : `Guardada la encuesta de ${nombre}`;
        ctx.alCambiar?.();
        if (!seguir) { m.hide(); toast(msg); return; }
        hechos.add(Number(f.beneficiario_id.value));
        el.querySelector('[data-resultado]').innerHTML = `<div class="alert alert-success py-2 mb-0"><i class="bi bi-check2-circle me-1"></i>${esc(msg)}${r.temas ? ` · ${Object.entries(r.temas).map(([t, v]) => `${esc(t)} ${pct(v.aciertos, v.total)}%`).join(' · ')}` : ''}</div>`;
        f.querySelectorAll('input[type=radio],input[type=checkbox]').forEach((x) => { x.checked = false; }); f.querySelectorAll('textarea,input[type=number]').forEach((x) => { x.value = ''; });
        const sig = bens.find((b) => !hechos.has(b.id));
        [...f.beneficiario_id.options].forEach((o) => { if (hechos.has(Number(o.value)) && !o.textContent.endsWith(' ✓')) o.textContent += ' ✓'; });
        f.beneficiario_id.value = sig ? sig.id : ''; el.querySelector('.modal-body').scrollTop = 0;
      } catch (x) { toast(x.message, false); }
    };
    f.onsubmit = (ev) => { ev.preventDefault(); guardar(false); };
    el.querySelector('[data-seguir]')?.addEventListener('click', () => guardar(true));
  }

  /* ---------- resultados ---------- */
  async function resultados(enc, ctx) {
    let d; try { d = await api(`/api/impacto/encuestas/${enc.id}/resultados`); } catch (x) { toast(x.message, false); return; }
    const qs = d.encuesta.preguntas, conOpc = qs.filter((q) => opcionesDe(q).length);
    const valTxt = (q, v) => (v == null || v === '' ? '' : Array.isArray(v) ? v.map((i) => opcionesDe(q)[i]).join(', ') : opcionesDe(q).length ? opcionesDe(q)[v] ?? '' : String(v));
    const { el, m } = modal(`<div class="modal-header"><div class="min-w-0"><h2 class="modal-title h5 text-truncate">Resultados · ${esc(enc.titulo)}</h2><div class="small text-body-secondary">${esc(enc.objetivo || '')}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">
        <div class="row g-2 mb-3"><div class="col-6 col-md-3"><div class="dw-card text-center py-2"><div class="small text-body-secondary">Respuestas</div><b class="fs-4">${d.total}</b></div></div>
          ${ctx.beneficiarios ? `<div class="col-6 col-md-3"><div class="dw-card text-center py-2"><div class="small text-body-secondary">Cobertura</div><b class="fs-4">${pct(new Set(d.respuestas.map((r) => r.beneficiario_id)).size, ctx.beneficiarios.length)}%</b><div class="small text-body-secondary">de ${ctx.beneficiarios.length} beneficiarios</div></div></div>` : ''}
          ${d.puntaje ? `<div class="col-6 col-md-3"><div class="dw-card text-center py-2"><div class="small text-body-secondary">Puntaje promedio</div><b class="fs-4 ${d.puntaje.promedio >= 70 ? 'text-success' : d.puntaje.promedio >= 50 ? 'text-warning' : 'text-danger'}">${d.puntaje.promedio}%</b></div></div>` : ''}</div>
        ${d.temas.length ? `<div class="dw-card mb-3"><div class="ro-h mt-0">Lo que saben, por tema</div>${d.temas.map((t) => barraH(`<b>${esc(t.tema)}</b>`, t.aciertos, t.total, t.pct >= 70 ? '#16a34a' : t.pct >= 50 ? '#f59e0b' : '#dc2626', ` aciertos`)).join('')}</div>` : ''}
        ${d.total ? Object.entries(porTema(d.preguntas)).map(([t, ps]) => `<div class="dw-card mb-3"><div class="ro-h mt-0">${esc(t)}</div>${ps.map((q) => `<div class="mb-3"><div class="small fw-semibold mb-1">${esc(q.texto)} <span class="text-body-secondary fw-normal">· ${q.respondidas} respuestas${q.aciertos != null ? ` · ${pct(q.aciertos, q.respondidas)}% acertó` : ''}</span></div>
            ${q.conteo ? q.conteo.map((n, i) => barraH(`${esc(opcionesDe(q)[i])}${q.correcta?.includes(i) ? ' <i class="bi bi-check2-circle text-success" title="Correcta"></i>' : ''}`, n, q.respondidas, q.correcta?.length ? (q.correcta.includes(i) ? '#16a34a' : '#94a3b8') : 'var(--dw-p)')).join('') : ''}
            ${q.promedio != null ? `<div class="small">Promedio: <b>${q.promedio}</b>${q.min != null ? ` · mínimo ${q.min} · máximo ${q.max}` : ''}</div>` : ''}
            ${q.textos?.length ? `<ul class="small mb-0 ro-enctx">${q.textos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>`).join('') : '<p class="text-body-secondary">Aún no hay respuestas.</p>'}
        <div class="dw-card"><div class="d-flex flex-wrap gap-2 align-items-center mb-2"><span class="ro-h m-0 flex-grow-1">Buscar en las respuestas</span><button class="btn btn-sm btn-outline-secondary" data-csv><i class="bi bi-download me-1"></i>CSV</button></div>
          <div class="row g-2 mb-2"><div class="col-md-4"><input class="form-control form-control-sm" type="search" data-q placeholder="Nombre o cualquier respuesta…"></div>
            <div class="col-md-5"><select class="form-select form-select-sm" data-fp><option value="">Filtrar por una pregunta…</option>${conOpc.map((q) => `<option value="${q.id}">${esc(q.texto)}</option>`).join('')}</select></div>
            <div class="col-md-3"><select class="form-select form-select-sm" data-fo disabled><option value="">Cualquier respuesta</option></select></div></div>
          <div class="small text-body-secondary mb-1" data-n></div><div class="table-responsive" style="max-height:360px"><table class="table table-sm align-middle mb-0"><thead><tr><th>Beneficiario</th><th>Fecha</th>${d.puntaje ? '<th>Puntaje</th>' : ''}<th>Respuestas</th><th></th></tr></thead><tbody data-rows></tbody></table></div></div>
      </div>`, { size: 'modal-xl' });
    const q = el.querySelector('[data-q]'), fp = el.querySelector('[data-fp]'), fo = el.querySelector('[data-fo]');
    let vis = d.respuestas;
    const resumen = (r) => qs.slice(0, 4).map((x) => valTxt(x, r.respuestas[x.id])).filter(Boolean).join(' · ');
    const filtrar = () => {
      const t = q.value.trim().toLowerCase(), pq = qs.find((x) => x.id === fp.value), op = fo.value === '' ? null : +fo.value;
      vis = d.respuestas.filter((r) => (!t || [r.beneficiario, ...qs.map((x) => valTxt(x, r.respuestas[x.id]))].join(' ').toLowerCase().includes(t))
        && (!pq || op == null || (Array.isArray(r.respuestas[pq.id]) ? r.respuestas[pq.id].includes(op) : r.respuestas[pq.id] === op)));
      el.querySelector('[data-n]').textContent = `${vis.length} de ${d.respuestas.length} respuestas`;
      el.querySelector('[data-rows]').innerHTML = vis.map((r) => `<tr><td><b class="small">${esc(r.beneficiario || '—')}</b>${r.edad ? `<div class="small text-body-secondary">${r.edad} años</div>` : ''}</td><td class="small text-nowrap">${C.day(r.fecha)}</td>
        ${d.puntaje ? `<td class="small text-nowrap">${r.puntaje_max ? `${r.puntaje}/${r.puntaje_max} · ${pct(r.puntaje, r.puntaje_max)}%` : '—'}</td>` : ''}<td class="small text-body-secondary">${esc(resumen(r))}</td>
        <td class="text-end text-nowrap">${ctx.W ? `<button class="btn btn-sm btn-light" data-red="${r.id}" title="Ver o editar"><i class="bi bi-pencil"></i></button>` : ''}${ctx.M ? `<button class="btn btn-sm btn-light" data-rdel="${r.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="small text-body-secondary">Nada coincide.</td></tr>';
    };
    q.addEventListener('input', filtrar);
    fp.addEventListener('change', () => { const pq = qs.find((x) => x.id === fp.value); fo.disabled = !pq; fo.innerHTML = `<option value="">Cualquier respuesta</option>${pq ? opcionesDe(pq).map((o, i) => `<option value="${i}">${esc(o)}</option>`).join('') : ''}`; filtrar(); });
    fo.addEventListener('change', filtrar);
    filtrar();
    el.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-csv]')) {
        const cel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const filas = [['Beneficiario', 'Edad', 'Comunidad', 'Fecha', ...(d.puntaje ? ['Puntaje', 'Máximo'] : []), ...qs.map((x) => x.texto)], ...vis.map((r) => [r.beneficiario, r.edad, r.comunidad, r.fecha, ...(d.puntaje ? [r.puntaje, r.puntaje_max] : []), ...qs.map((x) => valTxt(x, r.respuestas[x.id]))])];
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + filas.map((f) => f.map(cel).join(';')).join('\n')], { type: 'text/csv' })); a.download = `${enc.titulo.replace(/[^\w áéíóúñ-]+/gi, '').slice(0, 60) || 'encuesta'}.csv`; a.click(); return;
      }
      const ed = ev.target.closest('[data-red]'); if (ed) { m.hide(); const r = d.respuestas.find((x) => String(x.id) === ed.dataset.red); return responder({ ...enc, preguntas: qs }, { ...ctx, beneficiarios: [{ id: r.beneficiario_id, nombre: r.beneficiario }] }, r); }
      const del = ev.target.closest('[data-rdel]');
      if (del && await window.App.confirm({ title: '¿Borrar esta respuesta?', ok: 'Borrar' })) { try { await api(`/api/impacto/respuestas/${del.dataset.rdel}`, { method: 'DELETE' }); m.hide(); toast('Respuesta borrada'); ctx.alCambiar?.(); resultados(enc, ctx); } catch (x) { toast(x.message, false); } }
    });
  }

  /* ---------- lista de encuestas de la comunidad ---------- */
  async function montar(host, ctx) {
    const cargar = async () => {
      host.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
      const rows = (await api('/api/impacto/encuestas?limit=1000')).rows.filter((e) => !e.comunidad_id || e.comunidad_id === ctx.comunidad.id);
      host.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-2"><span class="small text-body-secondary flex-grow-1">Encuestas que los socios llenan con cada beneficiario de ${esc(ctx.comunidad.nombre)}.</span>${ctx.W ? '<button class="btn btn-primary btn-sm" data-enuevo><i class="bi bi-plus-lg me-1"></i>Nueva encuesta</button>' : ''}</div>
        ${rows.length ? `<div class="ro-pgrid">${rows.map((e) => `<div class="dw-card d-grid gap-2"><div class="d-flex gap-2 align-items-start"><span class="ro-av" style="width:40px;height:40px;font-size:17px"><i class="bi ${TIPO[e.tipo]?.[0] || 'bi-ui-checks'}"></i></span>
            <div class="flex-grow-1 min-w-0"><b class="d-block">${esc(e.titulo)}</b><span class="small text-body-secondary">${TIPO[e.tipo]?.[1] || e.tipo} · ${e.preguntas.length} preguntas${e.comunidad_id ? '' : ' · todas las comunidades'}</span></div>
            ${e.estado !== 'activa' ? C.chip(e.estado === 'cerrada' ? 'free' : 'soon', e.estado) : ''}${e.con_ia ? '<i class="bi bi-stars text-primary" title="Creada con IA"></i>' : ''}</div>
            ${e.objetivo ? `<div class="small">${esc(e.objetivo)}</div>` : ''}
            <div class="small"><b>${e.respuestas}</b> respuestas${e.ultima ? ` · última ${C.day(e.ultima)}` : ''}</div>
            <div class="d-flex gap-2 flex-wrap">${ctx.W && e.estado === 'activa' ? `<button class="btn btn-sm btn-primary" data-eresp="${e.id}"><i class="bi bi-pencil-square me-1"></i>Responder</button>` : ''}<button class="btn btn-sm btn-outline-primary" data-eres="${e.id}"><i class="bi bi-bar-chart me-1"></i>Resultados</button>
              ${ctx.W ? `<button class="btn btn-sm btn-light" data-eed="${e.id}" title="Editar"><i class="bi bi-gear"></i></button>` : ''}${ctx.M && !e.respuestas ? `<button class="btn btn-sm btn-light" data-edel="${e.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}</div></div>`).join('')}</div>`
          : window.App.empty('bi-clipboard2-data', ctx.W ? 'Aún no hay encuestas. Créala con IA contando qué quieres saber (p. ej. caracterización o cuánto saben de salud emocional) o usa una plantilla.' : 'Aún no hay encuestas.')}`;
      host.onclick = async (ev) => {
        const id = (k) => rows.find((e) => String(e.id) === ev.target.closest(`[${k}]`)?.getAttribute(k));
        const sub = { ...ctx, alCambiar: cargar };
        if (ev.target.closest('[data-enuevo]')) return nueva(sub);
        const rp = id('data-eresp'); if (rp) { const r = await api(`/api/impacto/encuestas/${rp.id}/resultados`).catch(() => null); return responder(rp, { ...sub, respondidos: (r?.respuestas || []).map((x) => x.beneficiario_id) }); }
        const rs = id('data-eres'); if (rs) return resultados(rs, sub);
        const ed = id('data-eed'); if (ed) return editor(ed, { comunidad: ctx.comunidad, alGuardar: cargar });
        const dl = id('data-edel'); if (dl && await window.App.confirm({ title: `¿Borrar «${dl.titulo}»?`, ok: 'Borrar' })) { try { await api(`/api/impacto/encuestas/${dl.id}`, { method: 'DELETE' }); toast('Encuesta borrada'); cargar(); } catch (x) { toast(x.message, false); } }
      };
    };
    await cargar();
  }

  document.head.insertAdjacentHTML('beforeend', `<style>.ro-encq{border:1px solid var(--bs-border-color);border-radius:12px;padding:10px}.ro-enc-ia{border:1px solid rgba(var(--dw-p-rgb),.35);background:rgba(var(--dw-p-rgb),.05);border-radius:14px;padding:14px}
    .ro-encop{display:flex;gap:8px;align-items:center;border:1px solid var(--bs-border-color);border-radius:10px;padding:6px 10px;cursor:pointer}.ro-encop:has(input:checked){border-color:var(--dw-p);background:rgba(var(--dw-p-rgb),.08)}
    .ro-enct{border:1px solid var(--bs-border-color);border-radius:14px;padding:12px 14px}.ro-enct legend{float:none;width:auto;padding:0 6px;font-size:1rem;margin-bottom:0}.ro-enctx{max-height:160px;overflow:auto}</style>`);
  return { montar, editor, responder, resultados };
})();
