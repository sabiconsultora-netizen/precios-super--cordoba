// Procesa el SEPA (Precios Claros) y deja solo los precios de supermercados de
// Córdoba, marcando además los que están cerca de Villa Allende y Saldán.
// Uso: node sepa-cordoba.mjs <carpeta-con-los-zip-de-cada-comercio-ya-descomprimidos>
// Salida: docs/cordoba.json (lo lee el panel de Romaneto).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const RAIZ = process.argv[2] || 'sepa';
const SALIDA = process.argv[3] || 'docs/cordoba.json';
// Punto medio entre Villa Allende y Saldán; "zona" = sucursales a menos de ZONA_KM.
const ZONA = { lat: -31.299, lng: -64.305 };
const ZONA_KM = Number(process.env.ZONA_KM || 9);
// Si existe docs/eans.txt (uno por renglón), solo se guardan esos productos.
const EANS_TXT = 'docs/eans.txt';

const limpiarEan = v => String(v || '').replace(/\D/g, '').replace(/^0+/, '');
const esCordoba = p => /(^|[-\s])X$/i.test(String(p || '').trim()) || /c[oó]rdoba/i.test(String(p || ''));
function km(a, b){
  const R = 6371, r = x => x * Math.PI / 180;
  const dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
  const h = Math.sin(dLa/2)**2 + Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLo/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function num(v){
  const t = String(v ?? '').trim(); if(!t) return null;
  const n = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t);
  return Number.isFinite(n) && n > 0 ? n : null;
}
// Lee un CSV del SEPA línea por línea. Separador "|" (o "," si no hay pipes),
// saca el BOM y descarta renglones que no tienen la misma cantidad de columnas
// (el último renglón trae la fecha de actualización).
async function* leerCsv(archivo){
  const rl = readline.createInterface({ input: fs.createReadStream(archivo, { encoding: 'utf8' }), crlfDelay: Infinity });
  let cab = null, sep = '|';
  for await (let linea of rl){
    if(!linea.trim()) continue;
    if(!cab){
      linea = linea.replace(/^\uFEFF/, '');
      sep = linea.includes('|') ? '|' : ',';
      cab = linea.split(sep).map(x => x.trim().replace(/^"|"$/g, '').toLowerCase());
      continue;
    }
    const cols = linea.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
    if(cols.length !== cab.length) continue;
    const o = {}; cab.forEach((c, i) => o[c] = cols[i]);
    yield o;
  }
}
function buscarArchivos(dir, nombre, out = []){
  for(const e of fs.readdirSync(dir, { withFileTypes: true })){
    const p = path.join(dir, e.name);
    if(e.isDirectory()) buscarArchivos(p, nombre, out);
    else if(e.name.toLowerCase() === nombre) out.push(p);
  }
  return out;
}

const filtroEans = fs.existsSync(EANS_TXT) ? new Set(fs.readFileSync(EANS_TXT, 'utf8').split(/\r?\n/).map(limpiarEan).filter(Boolean)) : null;
const banderas = [];                 // [{ nombre }]
const idxBandera = new Map();        // 'comercio|bandera' -> índice
const sucursales = new Map();        // 'comercio|bandera|sucursal' -> { b, zona, loc }
const precios = new Map();           // ean -> { d, por: Map(b -> {minC, sumC, nC, minZ, promo}) }
let fechaDatos = '', filasLeidas = 0, filasCba = 0;

const carpetas = [...new Set(buscarArchivos(RAIZ, 'productos.csv').map(p => path.dirname(p)))];
console.log(`Comercios encontrados: ${carpetas.length}${filtroEans ? ` · filtrando ${filtroEans.size} EAN` : ''}`);

for(const dir of carpetas){
  const fCom = path.join(dir, 'comercio.csv'), fSuc = path.join(dir, 'sucursales.csv'), fPro = path.join(dir, 'productos.csv');
  if(!fs.existsSync(fSuc)) continue;
  if(fs.existsSync(fCom)){
    for await (const c of leerCsv(fCom)){
      const k = `${c.id_comercio}|${c.id_bandera}`;
      if(!idxBandera.has(k)){ idxBandera.set(k, banderas.length); banderas.push({ nombre: c.comercio_bandera_nombre || c.comercio_razon_social || k }); }
      if(c.comercio_ultima_actualizacion && c.comercio_ultima_actualizacion > fechaDatos) fechaDatos = c.comercio_ultima_actualizacion;
    }
  }
  let sucCba = 0;
  for await (const s of leerCsv(fSuc)){
    if(!esCordoba(s.sucursales_provincia)) continue;
    const kb = `${s.id_comercio}|${s.id_bandera}`;
    if(!idxBandera.has(kb)){ idxBandera.set(kb, banderas.length); banderas.push({ nombre: kb }); }
    const coord = v => { const n = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(n) && n !== 0 ? n : null; };
    const lat = coord(s.sucursales_latitud), lng = coord(s.sucursales_longitud);
    const zona = lat !== null && lng !== null && km(ZONA, { lat, lng }) <= ZONA_KM;
    sucursales.set(`${s.id_comercio}|${s.id_bandera}|${s.id_sucursal}`, { b: idxBandera.get(kb), zona, loc: s.sucursales_localidad || '',
      nombre: s.sucursales_nombre || '', tipo: s.sucursales_tipo || '',
      dir: [s.sucursales_calle, s.sucursales_numero].filter(Boolean).join(' '), barrio: s.sucursales_barrio || '', lat, lng, n: 0 });
    sucCba++;
  }
  if(!sucCba) continue;
  for await (const p of leerCsv(fPro)){
    filasLeidas++;
    const suc = sucursales.get(`${p.id_comercio}|${p.id_bandera}|${p.id_sucursal}`);
    if(!suc) continue;
    const ean = limpiarEan(p.productos_ean === '1' || p.productos_ean === undefined ? p.id_producto : p.id_producto);
    if(!ean || ean.length < 7) continue;
    if(filtroEans && !filtroEans.has(ean)) continue;
    const precio = num(p.productos_precio_lista);
    if(!precio) continue;
    filasCba++;
    suc.n++;
    let e = precios.get(ean);
    if(!e){ e = { d: (p.productos_descripcion || '').slice(0, 60), por: new Map() }; precios.set(ean, e); }
    let x = e.por.get(suc.b);
    if(!x){ x = { minC: Infinity, sumC: 0, nC: 0, minZ: Infinity, promo: Infinity }; e.por.set(suc.b, x); }
    x.minC = Math.min(x.minC, precio); x.sumC += precio; x.nC++;
    if(suc.zona) x.minZ = Math.min(x.minZ, precio);
    const promo = num(p.productos_precio_unitario_promo1);
    if(promo && promo < precio) x.promo = Math.min(x.promo, promo);
  }
}

// Formato compacto: p[ean] = [descripción, [[bandera, minCórdoba, promedioCórdoba, minZona|0, promo|0], ...]]
const r2 = v => Math.round(v * 100) / 100;
const salida = {
  generado: new Date().toISOString(), fechaDatos, zonaKm: ZONA_KM,
  banderas: banderas.map(b => b.nombre),
  sucursalesCordoba: sucursales.size,
  sucursalesZona: [...sucursales.values()].filter(s => s.zona).length,
  // Sucursales de Córdoba para el mapa: [bandera, nombre, dirección, barrio, localidad, lat, lng, zona, productos informados, tipo]
  s: [...sucursales.values()].filter(x => x.lat !== null && x.lng !== null)
       .map(x => [x.b, x.nombre, x.dir, x.barrio, x.loc, x.lat, x.lng, x.zona ? 1 : 0, x.n, x.tipo]),
  p: {},
};
for(const [ean, e] of precios){
  salida.p[ean] = [e.d, [...e.por.entries()].map(([b, x]) => [b, r2(x.minC), r2(x.sumC / x.nC), x.minZ === Infinity ? 0 : r2(x.minZ), x.promo === Infinity ? 0 : r2(x.promo)])];
}
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, JSON.stringify(salida));
console.log(`Filas leídas: ${filasLeidas} · en Córdoba: ${filasCba} · productos: ${precios.size} · sucursales Córdoba: ${salida.sucursalesCordoba} (zona: ${salida.sucursalesZona}) · ${(fs.statSync(SALIDA).size/1e6).toFixed(1)} MB`);
