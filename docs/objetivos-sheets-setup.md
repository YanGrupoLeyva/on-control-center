# Conexión de Objetivos 2026 con Google Sheets

Estado: integración preparada; pendiente de crear/configurar el cliente OAuth de Google.
No publicar como una sincronización operativa hasta completar la prueba real.

La web existente se conserva en `https://on.leyvagroup.es/objetivos-2026/`.
Hoja original: `19aMmwC54gPx7Bzsw4Gh9Kf4XvdlfLIaC_EiUYpBAEO4`.
No se modifica su estructura ni se crean copias. El cliente resuelve la única pestaña mediante metadatos.

## Activación pendiente

1. Seleccionar o crear un proyecto de Google Cloud para ON / Objetivos 2026.
2. Habilitar **Google Sheets API**.
3. Configurar Google Auth Platform: nombre de aplicación, correo de asistencia y audiencia.
   Si el proyecto pertenece a la organización de Workspace y solo lo usa su personal, elegir audiencia interna.
   Si se usa audiencia externa en pruebas, añadir los usuarios de prueba. La publicación externa puede requerir verificación de Google.
4. Crear un cliente OAuth de tipo **Aplicación web**.
5. Añadir `https://on.leyvagroup.es` en **Orígenes de JavaScript autorizados**. No incluir `/objetivos-2026/`.
   Este flujo usa ventanas emergentes de Google Identity Services; no precisa un redirect URI de Base44.
6. Copiar exclusivamente el **ID de cliente público** a `public/objetivos-2026/sheets-config.js`.
   No usar ni guardar un secreto de cliente. Los tokens de acceso se mantienen solo en memoria.
7. Revisar que cada usuario tenga el permiso adecuado sobre la hoja original de Drive.
8. Verificar con dos sesiones de prueba y una celda acordada: conexión, carga de 9 empresas,
   actualización desde Sheets, guardado web→Sheets, borrado de texto y recuperación ante sesión caducada.
   Restaurar el valor original al acabar la prueba.
9. Publicar en la rama `main` mediante el flujo existente de GitHub Pages y verificar el resultado.

## Comportamiento

- Sin ID de cliente, no se activa la integración ni se altera el funcionamiento local previo.
- Con ID de cliente, las celdas son de solo lectura hasta conectar con Google.
- La hoja es la fuente compartida y el navegador conserva una copia consultable.
- Al conectar por primera vez se conserva la matriz local anterior bajo la clave `-before-sheets`.
- El guardado usa una cola con 800 ms de espera desde la última pulsación y escribe solo la celda cambiada.
- El valor se escribe como texto (`RAW`), incluso si comienza por `=`.
- Mientras la página está visible, consulta Sheets cada 30 segundos si no hay edición activa ni cambios pendientes.
- Las importaciones masivas y la carga de sugerencias quedan ocultas al activar Sheets; la exportación sigue disponible.
- Antes de cada escritura se releen las tablas y se comprueba el valor previo. Si difiere, se conserva la edición local,
  se bloquea el envío y se permite exportarla antes de cargar explícitamente la versión de Sheets.
- La comprobación y la escritura no son una transacción atómica: una edición simultánea de la misma celda
  entre ambas peticiones puede resolverse por la última escritura. Para garantías estrictas haría falta un servicio
  que centralice también todas las ediciones de la hoja.
- Los cambios pendientes viven en memoria y la copia local. Cerrar o recargar avisa de que todavía no llegaron a Sheets.
  Tras un fallo, usar reintento o renovar la sesión antes de cerrar, o exportar el CSV para conservar el texto.

## Validación local

`node --test tests/objetivos-sheets.test.mjs`

Documentación oficial:
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update
