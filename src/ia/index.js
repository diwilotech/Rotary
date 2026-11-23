// Herramientas de IA de los módulos propios. Las de los módulos centrales (Marketing, WhatsApp…) llegan de Diwilo Modulos
// (src/lib/central.js → centralTools) y mcp.js las une.
import control from './control.js';

export const TOOLS = [...control];
