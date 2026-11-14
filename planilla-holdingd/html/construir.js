// Arma la versión de un solo archivo (abre con doble clic, sin servidor).
//   node html/construir.js                     → html/dist/sistema-planilla-holdingd.html (sin datos; se versiona)
//   node html/construir.js --datos data/estado.json --salida data/planilla-con-datos.html
//                                              → la misma página con los datos ya cargados (datos personales: no se versiona)
const fs = require('fs'), path = require('path')
const dir = __dirname, arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const seguro = (t) => t.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
for (const f of ['datos.js', 'motor.js', 'importar.js', 'app.js']) {
  const codigo = seguro(fs.readFileSync(path.join(dir, f), 'utf8'))
  html = html.replace(`<script src="${f}"></script>`, () => `<script>/* ${f} */\n${codigo}\n</script>`)
}
const datos = arg('--datos')
if (datos) {
  const estado = JSON.parse(fs.readFileSync(datos, 'utf8'))
  html = html.replace('<script>/* datos.js */', () => `<script>window.PLANILLA_ESTADO_INICIAL = ${seguro(JSON.stringify(estado))}</script>\n<script>/* datos.js */`)
}
const salida = arg('--salida') || path.join(dir, 'dist', 'sistema-planilla-holdingd.html')
fs.mkdirSync(path.dirname(salida), { recursive: true })
fs.writeFileSync(salida, html)
console.log(`${path.relative(process.cwd(), salida)} · ${(html.length / 1024).toFixed(0)} KB${datos ? ' · con datos de ' + datos : ''}`)
