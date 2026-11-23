// Control del club por IA: cada herramienta llama a la MISMA ruta de la API (ver interno.js), así que respeta roles, módulos activos,
// suscripción vencida y bitácora. Las de escritura se marcan para que el asistente pida confirmación.
import { herramienta as H, crudHerramientas as CRUD } from './interno.js';

const id = (d) => ({ type: 'integer', ...(d ? { description: d } : {}) });
const txt = (d) => ({ type: 'string', ...(d ? { description: d } : {}) });
const num = (d) => ({ type: 'number', ...(d ? { description: d } : {}) });
const bool = (d) => ({ type: 'boolean', ...(d ? { description: d } : {}) });
const fecha = (d = 'AAAA-MM-DD') => txt(d);
const en = (vals, d) => ({ type: 'string', enum: vals, ...(d ? { description: d } : {}) });

export default [
  // Socios
  ...CRUD({ modulo: 'socios', base: 'socios', entidad: 'socios', singular: 'socio', plural: 'socios', escribe: 'admin', required: ['nombre'], filtros: { estado: 'activo, aspirante, inactivo o retirado' },
    props: { nombre: txt(), email: txt(), telefono: txt(), documento: txt(), fecha_nacimiento: fecha(), profesion: txt(), fecha_ingreso: fecha(), tipo_membresia: en(['socio', 'socio_externo', 'voluntario_invitado', 'aspirante', 'honorario']),
      estado: en(['activo', 'aspirante', 'inactivo', 'retirado']), cargo: txt('Cargo en la junta (vacío = sin cargo)'), paga_cuota: bool(), notas: txt() } }),
  H({ name: 'socios.ver_ficha', modulo: 'socios', tipo: 'lectura', description: 'Ficha 360 de un socio: asistencia, tareas y cuotas.', props: { id: id() }, required: ['id'], ruta: ['GET', '/api/socios/socios/:id/ficha'] }),
  H({ name: 'socios.activar_socio', modulo: 'socios', rol: 'admin', tipo: 'escritura', description: 'Activa al socio y genera su certificado de activación.', props: { id: id() }, required: ['id'], ruta: ['POST', '/api/socios/socios/:id/activar'] }),
  // Reuniones
  ...CRUD({ modulo: 'reuniones', base: 'reuniones', entidad: 'reuniones', singular: 'reunion', plural: 'reuniones', escribe: 'admin', required: ['titulo', 'fecha'],
    props: { tipo: en(['reunion', 'evento']), titulo: txt(), fecha: fecha(), hora_ini: txt('HH:MM'), hora_fin: txt('HH:MM'), lugar: txt(), modalidad: en(['presencial', 'virtual', 'mixta']), enlace: txt(), descripcion: txt(), minuta: txt(), compromisos: txt(), estado: en(['programada', 'confirmada', 'realizada', 'cancelada']) } }),
  H({ name: 'reuniones.calendario', modulo: 'reuniones', tipo: 'lectura', description: 'Reuniones y eventos de un rango de fechas con confirmados y presentes.', props: { desde: fecha(), hasta: fecha() }, ruta: ['GET', '/api/reuniones/calendario'] }),
  H({ name: 'reuniones.ver_asistencia', modulo: 'reuniones', tipo: 'lectura', description: 'Socios de una reunión con su confirmación y asistencia.', props: { id: id() }, required: ['id'], ruta: ['GET', '/api/reuniones/reuniones/:id/asistencia'] }),
  H({ name: 'reuniones.tomar_asistencia', modulo: 'reuniones', rol: 'admin', tipo: 'escritura', description: 'Marca quién asistió a una reunión.', props: { id: id(), marcas: { type: 'array', items: { type: 'object', properties: { socio_id: id(), presente: bool() }, required: ['socio_id', 'presente'] } } }, required: ['id', 'marcas'], ruta: ['PUT', '/api/reuniones/reuniones/:id/asistencia'] }),
  // Tareas
  ...CRUD({ modulo: 'tareas', base: 'tareas', entidad: 'tareas', singular: 'tarea', plural: 'tareas', required: ['titulo'], filtros: { estado: 'pendiente, en_curso, hecha o cancelada', socio_id: 'Id del responsable' },
    props: { titulo: txt(), descripcion: txt(), estado: en(['pendiente', 'en_curso', 'hecha', 'cancelada']), prioridad: en(['normal', 'alta', 'baja']), fecha_limite: fecha(), socio_id: id('Responsable'), proyecto_id: id(), reunion_id: id() } }),
  // Impacto
  ...CRUD({ modulo: 'impacto', base: 'impacto', entidad: 'proyectos', singular: 'proyecto', plural: 'proyectos', escribe: 'admin', required: ['nombre'],
    props: { nombre: txt(), descripcion: txt(), objetivo: txt(), estado: en(['propuesta', 'planeacion', 'en_curso', 'finalizado', 'cancelado']), fecha_inicio: fecha(), fecha_fin: fecha(), socio_lider_id: id(),
      beneficiados: id('Personas beneficiadas'), horas_servicio: id(), financiacion: en(['caja_mayor', 'externa', 'doble'], 'Origen de los recursos'), presupuesto: num(), monto_caja_mayor: num(), monto_externo: num(), financiador: txt() } }),
  H({ name: 'impacto.tarjetas', modulo: 'impacto', tipo: 'lectura', description: 'Proyectos con beneficiados, avance de tareas, alianzas, origen de recursos y lo gastado de la caja mayor.', ruta: ['GET', '/api/impacto/tarjetas'] }),
  ...CRUD({ modulo: 'impacto', base: 'impacto', entidad: 'alianzas', singular: 'alianza', plural: 'alianzas', required: ['nombre'], filtros: { estado: 'prospecto, seguimiento, activa, cerrada o descartada' },
    props: { nombre: txt(), tipo: txt(), contacto: txt(), telefono: txt(), correo: txt(), municipio: txt(), estado: en(['prospecto', 'seguimiento', 'activa', 'cerrada', 'descartada']), proyecto_id: id(), descripcion: txt(), proximo_paso: txt(), proximo_paso_fecha: fecha() } }),
  // Finanzas (cajas)
  ...CRUD({ modulo: 'cajas', base: 'cajas', entidad: 'movimientos', singular: 'movimiento', plural: 'movimientos', escribe: 'admin', required: ['caja', 'tipo', 'fecha', 'concepto', 'monto'], filtros: { caja: 'menor (Club) o mayor (Obras)' },
    props: { caja: en(['menor', 'mayor'], 'menor = Caja menor (Club), mayor = Caja mayor (Obras)'), tipo: en(['ingreso', 'egreso']), fecha: fecha(), concepto: txt(), categoria: txt(), monto: num(), proyecto_id: id(), observaciones: txt() } }),
  H({ name: 'cajas.resumen', modulo: 'cajas', rol: 'admin', tipo: 'lectura', description: 'Saldo de cada caja, ingresos y egresos del mes y gasto por categoría.', ruta: ['GET', '/api/cajas/resumen'] }),
  // Cuotas
  H({ name: 'cuotas.cartera', modulo: 'cuotas', rol: 'admin', tipo: 'lectura', description: 'Cómo va cada socio con sus cuotas: esperado, pagado, saldo y estado.', ruta: ['GET', '/api/cuotas/cartera'] }),
  H({ name: 'cuotas.listar_pagos', modulo: 'cuotas', rol: 'admin', tipo: 'lectura', description: 'Pagos de cuota (ingresos) con su estado.', props: { estado: en(['pendiente', 'verificado', 'rechazado', 'anulado']) }, ruta: ['GET', '/api/cuotas/pagos'] }),
  H({ name: 'cuotas.registrar_pago', modulo: 'cuotas', rol: 'admin', tipo: 'escritura', description: 'Registra un pago de cuota ya verificado (entra a la caja menor).', props: { socio_id: id(), monto: num(), fecha: fecha(), metodo: en(['transferencia', 'nequi', 'daviplata', 'efectivo', 'bre-b', 'otro']), observaciones: txt() }, required: ['socio_id', 'monto'], ruta: ['POST', '/api/cuotas/pagos'] }),
  H({ name: 'cuotas.verificar_pago', modulo: 'cuotas', rol: 'admin', tipo: 'escritura', description: 'Verifica un pago pendiente (entra a la caja menor).', props: { id: id() }, required: ['id'], ruta: ['POST', '/api/cuotas/pagos/:id/verificar'] }),
];
