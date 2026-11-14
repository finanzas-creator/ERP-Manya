// Arma la versión de un solo archivo: dist/sistema-planilla-holdingd.html (abre con doble clic, sin servidor).
// Uso: node html/construir.js
const fs = require('fs'), path = require('path')
const dir = __dirname
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
for (const f of ['datos.js', 'motor.js', 'importar.js', 'app.js']) {
  const codigo = fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\/script/gi, '<\\/script')
  html = html.replace(`<script src="${f}"></script>`, () => `<script>/* ${f} */\n${codigo}\n</script>`)
}
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })
const salida = path.join(dir, 'dist', 'sistema-planilla-holdingd.html')
fs.writeFileSync(salida, html)
console.log(`${path.relative(process.cwd(), salida)} · ${(html.length / 1024).toFixed(0)} KB`)
