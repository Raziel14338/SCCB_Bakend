# Guía de Instalación del Backend

Esta guía proporciona instrucciones paso a paso para configurar y ejecutar el backend del proyecto.

## Prerrequisitos

<h2>1. Instalar Node.js</h2>

   - Descarga e instala Node.js desde [https://nodejs.org/es](https://nodejs.org/es).

>[!IMPORTANT]
>Espera a que se instale por completo el node js

   - Verifica la instalación ejecutando:
     ```bash
     node -v
     npm -v
     ```

<h2>2. Instalar MySQL o XAMPP</h2>

   - Descarga e instala MySQL o XAMPP para configurar un servidor de base de datos local.
   
>[!NOTE]
>Puedes decargar XAMPP desde: https://www.apachefriends.org/es/download.html

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">

## Pasos de Instalación

<h2>3. Clonar el Repositorio</h2>

   - Clona el repositorio del proyecto usando:
   
   ```bash
   git clone https://github.com/Raziel14338/SCCB_Bakend.git
   ```

<h2>4. Instalar Dependencias</h2>

   - Navega al directorio del proyecto e instala las dependencias requeridas:
   
   ```bash
   npm install
   ```

<h2>5. Configurar Variables de Entorno</h2>

>[!IMPORTANT]
>Este archivo es importante para no guardar datos sensibles como contraseñas

   - Crea un archivo `.env` en la raíz del proyecto:
     ```powershell
     New-Item -Path .env -ItemType File -Force
     ```
   - Agrega las siguientes variables al archivo `.env`:
     ```powershell
     Add-Content -Path .env -Value "DB_HOST=localhost"
     Add-Content -Path .env -Value "DB_USER=root"
     Add-Content -Path .env -Value "DB_PASSWORD="
     Add-Content -Path .env -Value "DB_DATABASE=sccb"
     Add-Content -Path .env -Value "CI_ENCRYPTION_KEY= crear_clave_encriptada"
     ```
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">
<h2>6. Configurar la Base de Datos</h2>

   - Ejecuta el script de la base de datos (`db`) para crear la estructura de la base de datos necesaria.

<h2>7. Compilar el Proyecto</h2>

   - Compila el proyecto para transformar la carpeta `src` en la carpeta `dist`:
     ```bash
     npm run build
     ```
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">
<h2>8. Ejecutar el Proyecto</h2>

   - Inicia el servidor de desarrollo (se reinicia automáticamente al hacer cambios):
     ```bash
     npm run dev
     ```

   - Alternativamente, ejecuta el proyecto compilado:
>[!IMPORTANT]
>Este comando es importante para crear el API para el frontend.

   ```bash
   npm run build
   ```
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">
<h2>9. Descargar atualizaciones</h2>

>[!IMPORTANT]
>Este comando es importante para poder descargar todas las actualizaciones que se suban a este repositorio.

   ```bash
   git pull
   ```
