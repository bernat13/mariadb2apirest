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

Si ya tienes una base de datos corriendo (por ejemplo en tu host o en otro servidor), puedes ejecutar el contenedor pasando las credenciales.

> **Nota**: Si conectas a una BBDD en tu misma máquina (localhost), usa `--network="host"` (solo Linux) o `host.docker.internal` (Mac/Windows) para que el contenedor vea tu BBDD.

```bash
docker run -d \
  --name mariadb-api \
  -p 3000:3000 \
  -e DB_HOST=host.docker.internal \
  -e DB_USER=root \
  -e DB_PASSWORD=tu_password \
  -e DB_NAME=tu_base_de_datos \
  ghcr.io/tu-usuario/mariadb2apirest:latest
```

Una vez arrancado:
- **API**: `http://localhost:3000/{nombre_tabla}`
- **Swagger**: `http://localhost:3000/api-docs`

---

### Opción 2: Docker Compose (Stack Completo)

Esta es la forma recomendada para pruebas. Levanta una base de datos MariaDB y la API simultáneamente.

El puerto `3306` de MariaDB se expone para que puedas conectarte con tu cliente SQL favorito (DBeaver, HeidiSQL, Workbench) y crear tablas. **La API detectará automáticamente las tablas al reiniciar el contenedor de la API (o si implementas reconexión/polling, pero actualmente escanea al inicio).**

Crea un archivo `docker-compose.yml`:

```yaml
version: '3.8'

services:
  # Servicio de Base de Datos MariaDB
  db:
    image: mariadb:latest
    container_name: demo-mariadb
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: mydatabase
      MYSQL_USER: myuser
      MYSQL_PASSWORD: mypassword
    ports:
      - "3306:3306" # Puerto abierto para tu cliente SQL
    volumes:
      - db_data:/var/lib/mysql

  # Servicio de API Dinámica
  api:
    build: . # O usa la imagen: image: ghcr.io/tu-usuario/mariadb2apirest:latest
    container_name: dynamic-api
    restart: always
    ports:
      - "3000:3000"
    environment:
      DB_HOST: db # Nombre del servicio de BBDD en la red de docker
      DB_PORT: 3306
      DB_USER: root
      DB_PASSWORD: rootpassword
      DB_NAME: mydatabase
      PORT: 3000
    depends_on:
      - db

volumes:
  db_data:
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
5. Accede a Swagger: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

---

## CI/CD - Github Actions

Este repositorio incluye un workflow en `.github/workflows/publish.yml` que automáticamente construye y publica la imagen en Docker Hub cuando haces un push a `main`.

Para que funcione, necesitas configurar los "Secrets" en tu repositorio de GitHub:
- `DOCKERHUB_USERNAME`: Tu usuario de Docker Hub.
- `DOCKERHUB_TOKEN`: Tu token de acceso de Docker Hub.
