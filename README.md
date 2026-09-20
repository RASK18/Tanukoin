# Tanukoin

Finanzas personales en español, en tu navegador. PWA estática sin backend, analítica ni cuentas de usuario.

**Web:** https://disboard.es/Tanukoin/ · **Licencia:** [AGPL-3.0](LICENSE.md)

![Tanu](public/tanu.webp)

## Funciones

- CSV, XLS/XLSX y PDF con texto: columnas configurables, perfiles, corrección y revisión de duplicados antes de guardar.
- Cuentas, categorías de dos niveles, notas, edición en lote y relaciones de transferencia/devolución.
- Reglas por prioridad que respetan categorías manuales, con revisión para aplicarlas al historial.
- Resumen, gráficos y calendario semanal, mensual y anual. Monedas separadas, sin conversión automática.
- Google Timeline: `semanticSegments`, `timelineObjects` y `Records.json`. Ubicaciones sugeridas o confirmadas y corrección manual.
- Embeddings locales para categorizar y buscar por similitud. Tanu interpreta consultas con un modelo WebGPU descargable; la aplicación valida las consultas y calcula las cifras. El chat no modifica movimientos.
- Enable Banking mediante una extensión opcional Manifest V3 para Chrome/Edge de escritorio.
- Copias completas JSON y exportación de movimientos CSV.

## Desarrollo

Node.js 24 y pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Abre `http://127.0.0.1:5173/Tanukoin/`. Cambiar dominio, puerto o perfil abre otro espacio de almacenamiento local.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm preview
```

Playwright prueba `dist/`. Para comprobar el modelo real (descarga aproximada de 118 MB), usa `TEST_LOCAL_MODEL=1 pnpm test:e2e` en Bash o `$env:TEST_LOCAL_MODEL='1'; pnpm test:e2e` en PowerShell. Esta descarga no se realiza en cada despliegue.

## Publicación y versiones

GitHub Actions comprueba tipos, pruebas unitarias, compilación y pruebas de navegador antes de publicar. Configura **Settings → Pages → Source → GitHub Actions**. La ruta es `/Tanukoin/`; `disboard.es` se hereda del sitio de usuario de GitHub Pages.

El versionado sigue Schedulime: `major.minor` del paquete y número de commits, con respaldo al patch del paquete. `APP_VERSION` y `APP_UPDATED_AT` permiten sobrescribirlo. Se genera `version.json` y se comprueba al abrir, reconectar o volver a la pestaña, como máximo una vez cada 15 minutos. **Actualizar ahora** espera al service worker y se desactiva durante operaciones o ediciones pendientes.

Actualizar conserva IndexedDB y las cachés independientes de modelos. El esquema actual es 1. Las futuras migraciones deberán añadirse mediante `db.version(...).upgrade(...)` y probarse con una base anterior.

## Extensión bancaria

La compilación genera `extension-dist/` y `dist/extension/tanukoin-extension.zip`. Descomprime el ZIP y usa **Cargar descomprimida** en `chrome://extensions` o `edge://extensions`, con modo desarrollador activado.

Los workflows fijan `SITE_ORIGIN=https://disboard.es`; una compilación local usa `http://127.0.0.1:5173`. Para otra instalación, establece `SITE_ORIGIN` antes de compilar. El conector valida origen, ruta y operaciones y solo consulta `api.enablebanking.com`. No permite pagos ni URLs arbitrarias. Las etiquetas Git `v*` publican el ZIP en Releases. Su actualización es independiente de la PWA.

Cada persona necesita su propia aplicación, Application ID, PEM PKCS#8 y cuentas vinculadas en Enable Banking. La guía integrada muestra la URL exacta de retorno. Web Crypto importa la clave como no exportable y la mantiene en memoria. Se envían tokens firmados y solicitudes bancarias, nunca el PEM. Una recarga obliga a cargar credenciales y autorizar de nuevo.

## Offline y privacidad

La aplicación prepara aproximadamente 90 MB sin comprimir de interfaz, lectores y motores; los modelos se descargan aparte, por decisión del usuario. Espera al indicador **Disponible sin conexión**. Importar archivos, editar, consultar, generar gráficos y consultar ubicaciones guardadas funciona offline. Cada modelo se marca preparado después de reiniciarlo y ejecutarlo sin permitir descargas externas.

Mapas, búsqueda y banca empiezan desactivados. El callejero usa OpenStreetMap online sin descargas masivas. La búsqueda muestra el nombre público y localidad que enviará a Photon/Wikipedia. Los archivos, importes, conversaciones e historial completo no se envían a esos servicios. Descargar modelos contacta con Hugging Face y los recursos de WebLLM. No existe sustitución por IA remota.

Tanukoin no cifra los datos: quien acceda a tu perfil del navegador puede leerlos. Borrar el almacenamiento elimina la información local; el navegador también puede desalojar cachés. Solicita almacenamiento persistente y descarga copias en Ajustes. Las copias excluyen credenciales y modelos; restaurarlas desactiva las conexiones externas.

## Validación y límites

Las pruebas cubren cálculos, fechas, relaciones, reglas, recurrencias, consultas de Tanu, Timeline, copias y restricciones del puente. Playwright verifica los flujos principales, lectores, arranque offline y diseño móvil/escritorio. La prueba optativa usa embeddings reales y comprueba su caché offline.

La autorización real bancaria requiere credenciales personales y pruebas con el sandbox o banco. El chat necesita WebGPU, `shader-f16` y memoria suficiente; la carga y rendimiento deben comprobarse en hardware compatible. Estas comprobaciones externas no quedan sustituidas por tests de lógica. No hay OCR: los PDF escaneados necesitan otro formato y los diseños complejos pueden necesitar correcciones. Las ubicaciones y categorías inferidas son propuestas revisables.

## Código y atribuciones

`src/data`: base local; `src/lib`: cálculos y copias; `src/features`: importación, banca, ubicaciones e IA; `src/pages`: pantallas; `extension`: conector independiente. Archivos e IA se procesan en workers. No hay secretos del usuario en la compilación.

Inspirado por [KashaFlow](https://github.com/KashaMalaga/KashaFlow) y por las actualizaciones de Schedulime. No se ha copiado código de KashaFlow. Tanu es una ilustración raster original creada para este proyecto; los iconos proceden de Lucide. Véanse las [atribuciones](THIRD_PARTY_NOTICES.md).
