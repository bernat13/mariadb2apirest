# Dynamic MariaDB to REST API

Este proyecto genera automáticamente una API REST completa (CRUD) y documentación Swagger basándose en el esquema de una base de datos MariaDB existente.

## Características

- 🚀 **Generación Dinámica**: No requiere configuración de esquemas manual. Lee las tablas directamente de la base de datos.
- 📄 **Swagger UI**: Documentación interactiva disponible en `/api-docs`.
- 🐳 **Docker Ready**: Listo para desplegar en contenedores.
- 🔓 **Sin Autenticación**: (Como solicitado) La API es pública.

## Variables de Entorno

El contenedor se configura mediante las siguientes variables de entorno:

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `DB_HOST` | Host de la base de datos | `localhost` |
| `DB_PORT` | Puerto de la base de datos | `3306` |
| `DB_USER` | Usuario de la base de datos | `root` |
| `DB_PASSWORD` | Contraseña del usuario | `password` |
| `DB_NAME` | Nombre de la base de datos a exponer | `test` |
| `PORT` | Puerto de la API | `3000` |

---

## 🛠️ Uso con Docker

### Opción 1: Docker Run (Contenedor Individual)

Si ya tienes una base de datos corriendo, puedes ejecutar el contenedor directamente descargando la imagen desde **Docker Hub**.

#### Escenarios de Conexión:

| Escenario | Valor de `DB_HOST` | Comando / Nota |
|-----------|-------------------|----------------|
| **BBDD en el Host (Linux)** | `localhost` | Usa `--network="host"` en el comando `docker run`. |
| **BBDD en el Host (Mac/Win)** | `host.docker.internal` | Valor por defecto en Docker Desktop. |
| **Otro Contenedor (misma red)** | `nombre_del_contenedor` | Ambos deben estar en la misma red de Docker. |
| **Servidor Remoto (IP)** | `192.168.1.XX` | Asegúrate que la BBDD permite conexiones externas. |

---

### ⚠️ ¿Por qué no puedo usar `localhost` a secas?

Esta es la duda más común. **Dentro de un contenedor, `localhost` se refiere al propio contenedor**, no a tu ordenador. 

Si tu base de datos está instalada "en el Windows/Linux/Mac" (fuera de Docker) y pones `DB_HOST=localhost`, la API buscará la base de datos **dentro de su propio contenedor** y no la encontrará.

**¿Cómo solucionarlo?**
1. **Windows/Mac**: Usa `host.docker.internal`. Docker mapea esto automáticamente a tu máquina real.
2. **Linux**: Tienes dos opciones:
   - Añadir `--network="host"` al arrancar el contenedor. Esto hace que el contenedor comparta la red con tu máquina y entonces **sí** funciona `localhost`.
   - Usar la IP real de tu máquina (ej. `192.168.1.X`).
3. **Entre Contenedores**: Si la base de datos también es un contenedor, usa el nombre del contenedor (ej: `DB_HOST=mi-mariadb-container`). Para esto, ambos deben estar en la misma red de Docker (`docker network connect`).

#### Ejemplo de ejecución:

```bash
docker run -d \
  --name mariadb-api \
  -p 3000:3000 \
  -e DB_HOST=192.168.1.50 \
  -e DB_USER=root \
  -e DB_PASSWORD=tu_password \
  -e DB_NAME=tu_base_de_datos \
  bernat13/mariadb2apirest:latest
```

Una vez arrancado:
- **API**: `http://localhost:3000/{nombre_tabla}`
- **Documentación Swagger**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

---

## 📖 Documentación Interactiva (Swagger)

Una de las joyas de este proyecto es que genera automáticamente una interfaz de **Swagger UI**. 

1. Abre tu navegador en: `http://localhost:3000/api-docs`.
2. Verás todos los "endpoints" agrupados por tablas.
3. Puedes **probar la API directamente** haciendo clic en "Try it out" en cada endpoint. No necesitas herramientas externas como Postman para empezar.

---

## 🛒 Ejemplo Práctico: Una Tienda Online

Imagina que tu base de datos MariaDB tiene las siguientes tablas: `productos`, `clientes` y `pedidos`. La API generará automáticamente estas rutas para ti:

### 1. Gestión de Productos
- `GET /productos`: Lista todos los productos disponibles.
- `POST /productos`: Registra un nuevo producto.
- `GET /productos/5`: Obtiene el detalle del producto con ID 5.
- `PUT /productos/5`: Actualiza el precio o stock del producto 5.
- `DELETE /productos/5`: Elimina el producto 5.

### 2. Ejemplo de consulta (cURL)
Si quieres obtener todos los productos de tu tienda desde la terminal:
```bash
curl -X GET http://localhost:3000/productos
```

### 3. Ejemplo de creación (JSON)
Para añadir un nuevo producto enviando un JSON al endpoint:
```bash
curl -X POST http://localhost:3000/productos \
     -H "Content-Type: application/json" \
     -d '{"nombre": "Teclado Mecánico", "precio": 89.99, "stock": 15}'
```

> [!NOTE]
> **Detección de Tablas**: Recuerda que la API escanea la base de datos **al iniciar**. Si creas tablas nuevas mientras el contenedor está corriendo, deberás reiniciarlo con `docker restart dynamic-api` para que aparezcan en Swagger y en las rutas.

### Opción 2: Docker Compose (Configuración Standalone)

Esta es la forma recomendada para mantener tu stack organizado. En este modo la API se conecta a una base de datos que ya tienes funcionando.

> [!TIP]
> **Retry Logic**: La API ahora incluye una lógica de reintento. Si la base de datos no está lista inmediatamente, reintentará la conexión cada 5 segundos hasta 5 veces antes de fallar.

Crea un archivo `docker-compose.yml`:

```yaml
version: '3.8'

services:
  api:
    image: bernat13/mariadb2apirest:latest
    container_name: dynamic-api
    restart: always
    ports:
      - "3000:3000"
    environment:
      DB_HOST: host.docker.internal # O la IP de tu base de datos
      DB_PORT: 3306
      DB_USER: root
      DB_PASSWORD: rootpassword
      DB_NAME: mydatabase
      PORT: 3000
```

#### Pasos para probar:
1. Ejecuta:
   ```bash
   docker-compose up -d
   ```
2. Conéctate a la BBDD con tu cliente SQL (`localhost:3306`, user: `root`, pass: `rootpassword`).
3. Crea una tabla de prueba:
   ```sql
   USE mydatabase;
   CREATE TABLE usuarios (
     id INT AUTO_INCREMENT PRIMARY KEY,
     nombre VARCHAR(50),
     email VARCHAR(50)
   );
   INSERT INTO usuarios (nombre, email) VALUES ('Juan', 'juan@example.com');
   ```
4. **Reinicia la API** para que detecte la nueva tabla (ya que el escaneo ocurre al arrancar):
   ```bash
   docker restart dynamic-api
   ```
### 🚀 Caso Específico: Conectar a `mariadb_container`

Según tu configuración actual, para conectar la API a tu contenedor MariaDB ya existente:

1. Asegúrate de que el archivo `docker-compose.yml` tiene la red `mariadb_default` marcada como **externa**:
   ```yaml
   networks:
     mariadb_default:
       external: true
   ```
2. La API usará `DB_HOST=mariadb_container` y la contraseña `54321Ba##`.
3. Levanta la API con:
   ```bash
   docker-compose up -d
   ```

---

## CI/CD - Github Actions

Este repositorio incluye un workflow en `.github/workflows/publish.yml` que construye y publica automáticamente la imagen en **Docker Hub** en cada Pull Request o push a la rama principal.

Para que funcione, debes configurar los siguientes "Secrets" en tu repositorio de GitHub:
- `DOCKERHUB_USERNAME`: Tu usuario de Docker Hub.
- `DOCKERHUB_TOKEN`: Tu token de acceso (PAT) de Docker Hub.
