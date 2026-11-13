# Backlog · Planillas

Estado: ✅ hecho · 🔄 en curso · ⬜ pendiente.

- ⬜ **Repositorio propio** y **proyecto propio** en la nube (base Supabase + hosting) para publicar
- ✅ Spec R-01…R-29 · ✅ empleadores con REMYPE y régimen por trabajador
- ✅ Planilla del mes: sueldo, asignación familiar, vacaciones, horas extra 25/35, feriados, faltas, tardanzas, bonos, adelantos
- ✅ AFP/ONP/EsSalud con tasas SBS del periodo · ✅ quinta con proyección SUNAT · 🔄 lectura automática de la SBS: bloqueada por su protección anti-bots (nov 2026); se registran a mano cada mes (4 filas) hasta tener una fuente que lo permita
- ✅ Gratificación y bonificación (julio/diciembre), CTS (mayo/noviembre), provisiones por devengado, vacaciones con adelantos y vencidas
- ✅ Liquidación con CTS/grati/vacaciones truncas e indemnización por régimen y causal
- ✅ Cierre con boletas emitidas e imprimibles
- ✅ API de integración con el ERP de control de personal por código externo (R-27) y rol Recursos humanos · ⬜ conectar el ERP de personal (área de sistemas; guía en docs/integracion.md)
- ⬜ Archivos PLAME / AFPnet / T-Registro y pago masivo al banco
- ⬜ Constancia de depósito CTS imprimible; préstamos con cronograma de cuotas
- ✅ Criterios confirmados por el dueño de producto (D-04, D-05, D-06) · ✅ HoldingD conciliado con su planilla de octubre 2026 (en local) · ⬜ constancia REMYPE real
- ⬜ Datos del trabajador con vigencia (asignación familiar, AFP/ONP, salud, jornada): hoy un cambio recalcula meses anteriores (las boletas emitidas no cambian y se marcan "difiere")
- ⬜ Liquidación emitida como copia fiel (como la boleta); tope de 60 días de incapacidad para CTS; subsidio con el promedio de 12 meses
- ⬜ Rendimiento: la planilla recalcula todo el historial (≈1 s con 40 personas); guardar resultados al cerrar si crece
