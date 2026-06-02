# Manual técnico — Gestión de Almacén

Referencia para que un técnico informático pueda instalar, reinstalar, diagnosticar y reparar la aplicación sin necesidad de tener contexto previo.

---

## Índice

1. [Arquitectura general](#1-arquitectura-general)
2. [Ubicaciones clave en el equipo](#2-ubicaciones-clave-en-el-equipo)
3. [Base de datos — configuración y ruta en red](#3-base-de-datos--configuración-y-ruta-en-red)
4. [Instalación desde el instalador .exe](#4-instalación-desde-el-instalador-exe)
5. [Instalación desde el código fuente (GitHub)](#5-instalación-desde-el-código-fuente-github)
6. [Migraciones de base de datos](#6-migraciones-de-base-de-datos)
7. [Errores frecuentes y soluciones](#7-errores-frecuentes-y-soluciones)
8. [Backups](#8-backups)

---

## 1. Arquitectura general

| Capa | Tecnología | Notas |
|---|---|---|
| Ventana nativa | Tauri v2 (Rust) | Compila a .exe, no necesita navegador externo |
| Frontend | React 19 + TypeScript (Vite) | Se ejecuta dentro del WebView de Tauri |
| Base de datos | SQLite (archivo .db) | Un único fichero; puede estar en local o en red |
| Imágenes de productos | JPEG en disco local | Siempre en el AppData local, nunca en red |

La aplicación **no tiene servidor**. Es completamente local/escritorio. El único recurso externo es el fichero `.db`, que puede apuntar a una ruta de red (cuando la VPN está activa).

---

## 2. Ubicaciones clave en el equipo

Todas las rutas de AppData usan el identificador de la app: **`Inventario`**.

| Qué | Ruta |
|---|---|
| Directorio de datos de la app | `%APPDATA%\Inventario\` |
| **Ruta de red configurada (sync)** | `%APPDATA%\Inventario\db-path.txt` |
| Base de datos local (copia de trabajo) | `%APPDATA%\Inventario\inventario.db` |
| Timestamp del último push exitoso | `%APPDATA%\Inventario\last_push.txt` |
| Imágenes de productos | `%APPDATA%\Inventario\images\{id}.jpg` |
| Ejecutable instalado | `C:\Program Files\Gestión de Ropa\` (ruta por defecto del instalador) |
| Instalador en red | `Z:\instalador\` *(ver sección 4)* |

> Para abrir `%APPDATA%` rápidamente: `Win + R` → escribir `%APPDATA%` → Enter.

---

## 3. Base de datos — configuración y ruta en red

### Cómo funciona (sistema con sincronización automática)

La app **siempre trabaja sobre la BD local** (`%APPDATA%\Inventario\inventario.db`). La ruta de red en `db-path.txt` se usa exclusivamente para sincronizar, no como conexión directa.

**Al arrancar (pull automático):**
1. En un hilo paralelo con timeout de 5 s, la app compara la BD local con la de red.
2. Si la de red fue modificada por alguien más (no por un push propio) → copia red → local antes de abrir la app.
3. Si la local está al día, o la red no responde en 5 s → arranca directamente con la local.
4. El timeout de 5 s garantiza que una VPN caída o lenta **no congele el arranque**.

**Durante el uso (push automático):**
- A los 5 segundos del arranque, y luego cada 60 segundos, la app copia local → red.
- Al cerrar la ventana se lanza un último push.
- Cada push es **atómico**: primero escribe `inventario.tmp` en la unidad de red y luego hace rename instantáneo. Si el PC se apaga a mitad de copia, la BD de red permanece intacta.

**El usuario ve el estado en todo momento** mediante un chip en la cabecera de la app:

| Chip | Significado |
|---|---|
| `● Guardado 14:32` (verde) | Último push completado correctamente a esa hora |
| `● Sincronizando...` (gris) | Push en curso |
| `● Solo local` (ámbar) | VPN caída o red no accesible — trabajando en local |
| *(sin chip)* | Sin `db-path.txt` configurado — modo puramente local |

**Qué ocurre en cada escenario de cierre:**

| Situación | BD local | BD en red |
|---|---|---|
| Cierre normal de la app | Intacta | Push en `beforeunload` |
| PC se apaga sin cerrar la app | Intacta (WAL mode) | Último push atómico completo |
| Crash o matar proceso | Intacta (WAL mode) | Último push periódico (máx. 60 s antes) |
| PC hiberna | Intacta | Idem |

Resultado: si la VPN cae a mitad de sesión, la app **sigue funcionando** sin pérdida de datos. Cuando la VPN vuelve y el usuario arranca la app, los datos locales se sincronizan a la red automáticamente.

### Contenido del fichero `db-path.txt`

El fichero contiene **una sola línea**: la ruta absoluta al fichero `.db` de red (destino de la sincronización).

Ejemplo:
```
Z:\inventario.db
```

### Cambiar la ruta de red manualmente

1. Abrir `%APPDATA%\Inventario\`
2. Editar (o crear) `db-path.txt` con el Bloc de notas
3. Escribir la ruta y guardar
4. Reiniciar la aplicación

Para desactivar la sincronización con red: dejar el fichero vacío o borrarlo.

### Qué pasa si la VPN está caída

- La app arranca y trabaja normalmente sobre la BD local.
- Los intentos de push a red fallan en silencio.
- Cuando la VPN vuelve y se reinicia la app, se sincroniza automáticamente.
- **No hay pérdida de datos** mientras la VPN esté caída.

### Ruta de red en uso

La ruta configurada actualmente en el equipo es:

Z:\inventario.db

La IP del servidor a donde apunta Z: es 192.168.5.61. Para montar la ubicación de red, ejecutar este comando en Powershell:
net use Z: \\192.168.5.61\inventario /user:inventario Mejorada.2026 /persistent:yes

---

## 4. Instalación desde el instalador .exe

### Ubicación del instalador

El instalador se encuentra en la red en:

Z:\instalador\

El fichero se llama algo como `Gestión de Ropa_x.x.x_x64-setup.exe`.

### Pasos

1. **Conectar la VPN** (para acceder a la carpeta de red).
2. Ejecutar el `.exe` del instalador → seguir el asistente (Next, Install).
3. La app queda instalada. Al ejecutarla por primera vez, **crea automáticamente** la carpeta `%APPDATA%\Inventario\` y aplica todas las migraciones de BD.
4. **Configurar la ruta de BD** (si el equipo va a usar la BD compartida en red):
   - Abrir `%APPDATA%\Inventario\`
   - Crear el fichero `db-path.txt`
   - Escribir dentro la ruta UNC de la BD (ver sección 3)
5. Reiniciar la app. Verificar que carga datos correctamente.

### Reinstalación sobre una instalación existente

- El instalador sobreescribe los binarios pero **no toca `%APPDATA%\Inventario\`**.
- El fichero `db-path.txt`, la BD local y las imágenes se conservan.
- No es necesario volver a configurar la ruta de BD tras reinstalar.

---

## 5. Instalación desde el código fuente (GitHub)

Repositorio: **https://github.com/DanVPZ/gestion_almacen**

Útil cuando se necesita modificar el código, depurar, o compilar una nueva versión del instalador.

### Requisitos previos

| Herramienta | Versión mínima | Descarga |
|---|---|---|
| Node.js | 18 | https://nodejs.org |
| Rust | 1.77.2 | https://rustup.rs |
| Visual C++ Build Tools | — | https://visualstudio.microsoft.com/visual-cpp-build-tools/ (marcar "Desarrollo de escritorio con C++") |
| Git | cualquiera | https://git-scm.com |

Verificar instalación:
```powershell
node -v
npm -v
rustc --version
cargo --version
```

### Clonar y arrancar

```powershell
git clone https://github.com/DanVPZ/gestion_almacen.git
cd gestion_almacen
npm install
npm run tauri dev
```

`tauri dev` arranca Vite en `localhost:5173` y abre la ventana nativa. La compilación inicial de Rust puede tardar 5-10 minutos.

### Compilar el instalador

```powershell
npm run tauri build
```

El instalador `.exe` (y el `.msi`) se generan en:
```
src-tauri\target\release\bundle\nsis\
src-tauri\target\release\bundle\msi\
```

Copiar el `.exe` resultante a la carpeta de red para que esté disponible en los demás puestos.

### Tras compilar: configurar la BD

Igual que en la instalación por `.exe` (ver sección 4, paso 4).

---

## 6. Migraciones de base de datos

La app gestiona el esquema de BD automáticamente mediante migraciones versionadas. **No hay que ejecutar SQL manualmente**.

Cada vez que arranca, el plugin `tauri-plugin-sql` compara la versión actual del esquema con las migraciones definidas en `src-tauri/src/lib.rs` y aplica las que falten.

### Versiones actuales (9 migraciones)

| Versión | Descripción |
|---|---|
| 1 | Esquema base: departamentos, productos, tallas, movimientos, pedidos, colores |
| 2 | Columna `borrador` en pedidos |
| 3 | Columna `notas` en pedidos |
| 4 | Recepción parcial por línea de pedido (`cantidad_acordada`, `cantidad_recibida`, `estado`) |
| 5 | Módulos gasolina, productos de limpieza, presentaciones, settings |
| 6 | Tabla `stock_productos` (stock global por producto) |
| 7 | Stock por producto y presentación (refactorización) |
| 8 | Módulo almacén general (`categorias_stock`, `articulos_stock`, `movimientos_stock`) |
| 9 | `tipo_producto`, `uds_por_caja`, precio migrado, esquema de salidas simplificado |

### Si las migraciones fallan al arrancar

Síntoma: la app se abre pero no muestra datos, o cierra inesperadamente.

Comprobaciones:
1. La ruta en `db-path.txt` es accesible (VPN activa, ruta correcta).
2. El fichero `.db` no está bloqueado por otro proceso (otro usuario con la app abierta, o un antivirus escaneando el fichero).
3. El fichero `.db` no está corrupto (ver sección de errores frecuentes).

---

## 7. Errores frecuentes y soluciones

### La app arranca pero no carga datos / pantallas en blanco

Con el sistema de sincronización actual, la VPN caída **no debería causar este síntoma** (la app trabaja siempre sobre BD local). Si ocurre, las causas probables son:

1. **Primera instalación sin datos locales**: la BD local está vacía y la red tampoco era accesible al arrancar. Conectar VPN y reiniciar — el pull traerá los datos de red.
2. **BD local corrupta**: ver sección "La base de datos está corrupta".
3. **`db-path.txt` mal configurado**: si la ruta apunta a un fichero `.db` vacío o inexistente en red, el pull trajo una BD vacía. Corregir la ruta y restaurar desde backup.

Para diagnosticar: abrir `%APPDATA%\Inventario\` y verificar que `inventario.db` existe y tiene un tamaño razonable (> 50 KB si hay datos). Si está vacío (0-4 KB), restaurar desde backup.

### "database is locked" o errores de escritura

**Causa:** otro proceso tiene el `.db` abierto en modo exclusivo.

1. Comprobar si otro usuario tiene la app abierta con esa BD.
2. El fichero `.db` usa WAL (`PRAGMA journal_mode = WAL`), lo que permite lecturas concurrentes pero no múltiples escrituras simultáneas.
3. Solución: cerrar la app en el otro equipo antes de operar.

### La app no arranca (crash inmediato)

1. Revisar el Visor de Eventos de Windows (`eventvwr.msc` → Registros de Windows → Aplicación) para ver el error.
2. Comprobar que `%APPDATA%\Inventario\` existe y tiene permisos de escritura para el usuario.
3. Si `db-path.txt` contiene una ruta inválida o el fichero `.db` está corrupto, la app puede fallar al inicializar el plugin SQL. Vaciar `db-path.txt` y reintentar.

### La base de datos está corrupta

Síntomas: errores SQL aleatorios, datos que desaparecen, app que no carga.

1. **Restaurar desde backup** (ver sección 8).
2. Si no hay backup reciente, intentar reparar con SQLite:
   ```powershell
   # Instalar sqlite3 CLI si no está disponible
   # Desde la carpeta donde está el .db:
   sqlite3 inventario.db "PRAGMA integrity_check;"
   sqlite3 inventario.db ".recover" | sqlite3 inventario_recuperado.db
   ```
3. Sustituir el `.db` corrupto por el recuperado y reiniciar la app.

### Las imágenes de productos no aparecen

Las imágenes se guardan **siempre en local** (`%APPDATA%\Inventario\images\`), no en la red. Si se cambia de equipo o se reinstala Windows, las imágenes se pierden aunque la BD esté en red.

Recuperación: copiar la carpeta `images\` desde el equipo original a `%APPDATA%\Inventario\images\` en el nuevo equipo.

### Cambiar de BD local a BD en red (o viceversa)

Editar `db-path.txt`:
- **Para usar red:** escribir la ruta UNC (ej: `\\NAS01\Almacen\inventario.db`)
- **Para usar local:** dejar el fichero vacío o borrarlo

Si se migra de local a red por primera vez y se quiere conservar los datos locales:
1. Copiar `%APPDATA%\Inventario\inventario.db` a la ruta de red.
2. Configurar `db-path.txt` con la ruta de red.
3. Reiniciar la app.

### El módulo de Almacén General no aparece en el menú

Causa: la migración 8 no se ha aplicado (BD antigua que no ha arrancado la app nueva).

1. Arrancar la app una vez — las migraciones se aplican automáticamente al iniciar.
2. Si sigue sin aparecer, abrir la BD con [DB Browser for SQLite](https://sqlitebrowser.org/) y verificar que existen las tablas `categorias_stock`, `articulos_stock` y `movimientos_stock`.

---

## 8. Backups

### Backup automático desde la app

La app incluye una función de backup accesible desde la interfaz. Genera una copia del fichero `.db` con nombre `inventario_YYYY-MM-DD.db` en la carpeta que se indique.

Se recomienda configurar una copia periódica (manual o mediante tarea programada de Windows) apuntando a una carpeta de red o a un disco externo.

### Backup manual

```powershell
# Ejemplo: copiar la BD local a un directorio de backup
Copy-Item "$env:APPDATA\Inventario\inventario.db" "\\NAS01\Backups\inventario_$(Get-Date -Format 'yyyy-MM-dd').db"
```

Si la BD está en red, copiar el fichero `.db` de la ruta de red al directorio de backup.

### Restaurar un backup

1. Cerrar la app en todos los equipos que la tengan abierta.
2. Renombrar el `.db` actual a `inventario_CORRUPTO.db` (conservarlo por si acaso).
3. Copiar el fichero de backup y renombrarlo a `inventario.db`.
4. Reiniciar la app — las migraciones no se vuelven a aplicar porque el fichero ya tiene el esquema correcto.

---

## Referencia rápida

```
Instalador en red:     \\192.168.5.61\instalador\Gestión de Ropa_x64-setup.exe
Repo fuente:           https://github.com/DanVPZ/gestion_almacen
BD en red:             \\192.168.5.61\inventario.db
Configurar ruta BD:    %APPDATA%\Inventario\db-path.txt
BD local (fallback):   %APPDATA%\Inventario\inventario.db
Imágenes:              %APPDATA%\Inventario\images\
```
