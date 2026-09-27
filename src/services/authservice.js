import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { connect } from "../database.js";

/**
 * AuthService
 * ------------------------------------------------------------------
 * Concentra TODA la lógica sensible de autenticación:
 *   - hashing / verificación de contraseñas (bcrypt)
 *   - firma y verificación de JWT
 *   - las consultas SQL contra `usuarios` / `roles`
 *
 * AuthController NO sabe nada de bcrypt ni de jsonwebtoken: solo llama
 * a estos métodos y traduce el resultado a una respuesta HTTP. Esto
 * facilita testear la lógica de negocio sin necesidad de mockear
 * req/res, y evita repetir SALT_ROUNDS o el secreto del JWT en varios
 * archivos.
 * ------------------------------------------------------------------
 */
class AuthService {
    constructor() {
        this.SALT_ROUNDS = 10;
        this.JWT_SECRET = process.env.JWT_SECRET;
        this.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

        if (!this.JWT_SECRET) {
            // Falla rápido: mejor detectar el problema al levantar el server
            // que al primer login en producción.
            console.warn(
                "[AuthService] ADVERTENCIA: JWT_SECRET no está definido en las variables de entorno."
            );
        }
    }

    // ------------------------------------------------------------
    // Registro
    // ------------------------------------------------------------
    async registrar({ nombre_usuario, password, nombre_completo, correo, institucion, id_rol }) {
        const db = connect();

        // 1. Verificar duplicados (nombre_usuario y correo son UNIQUE en la tabla)
        const [existentes] = await db.query(
            "SELECT id_usuario FROM usuarios WHERE nombre_usuario = ? OR correo = ? LIMIT 1",
            [nombre_usuario, correo]
        );

        if (existentes.length > 0) {
            const err = new Error("Ya existe un usuario con ese nombre de usuario o correo.");
            err.status = 409;
            throw err;
        }

        // 2. Verificar que el rol exista
        const [roles] = await db.query("SELECT id_rol FROM roles WHERE id_rol = ? LIMIT 1", [
            id_rol,
        ]);

        if (roles.length === 0) {
            const err = new Error(`El rol con id ${id_rol} no existe.`);
            err.status = 400;
            throw err;
        }

        // 3. Hashear contraseña
        const password_hash = await bcrypt.hash(password, this.SALT_ROUNDS);

        // 4. Insertar usuario
        const [resultado] = await db.query(
            `INSERT INTO usuarios
                (nombre_usuario, password_hash, nombre_completo, correo, institucion, id_rol, estado)
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVO')`,
            [nombre_usuario, password_hash, nombre_completo, correo, institucion, id_rol]
        );

        const usuario = await this.obtenerPerfilPorId(resultado.insertId);

        // Generamos el token con el mismo payload que usa login(), así el
        // usuario recién registrado queda autenticado de inmediato y no
        // depende de hacer un segundo request de login para probar el resto
        // de rutas protegidas.
        const token = this.generarToken({
            id_usuario: usuario.id_usuario,
            nombre_usuario: usuario.nombre_usuario,
            institucion: usuario.institucion,
            id_rol: usuario.id_rol,
            nombre_rol: usuario.nombre_rol,
            nivel_acceso: usuario.nivel_acceso,
        });

        return { usuario, token };
    }

    // ------------------------------------------------------------
    // Login
    // ------------------------------------------------------------
    async login({ nombre_usuario, password }) {
        const db = connect();

        const [filas] = await db.query(
            `SELECT u.id_usuario, u.nombre_usuario, u.password_hash, u.nombre_completo,
                    u.correo, u.institucion, u.estado,
                    r.id_rol, r.nombre_rol, r.nivel_acceso
               FROM usuarios u
               JOIN roles r ON r.id_rol = u.id_rol
              WHERE u.nombre_usuario = ?
              LIMIT 1`,
            [nombre_usuario]
        );

        if (filas.length === 0) {
            const err = new Error("Credenciales inválidas.");
            err.status = 401;
            throw err;
        }

        const usuario = filas[0];

        if (usuario.estado !== "ACTIVO") {
            const err = new Error("El usuario se encuentra inactivo o suspendido.");
            err.status = 403;
            throw err;
        }

        const passwordValida = await bcrypt.compare(password, usuario.password_hash);

        if (!passwordValida) {
            const err = new Error("Credenciales inválidas.");
            err.status = 401;
            throw err;
        }

        // Actualiza último acceso sin bloquear la respuesta del login
        db.query("UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?", [
            usuario.id_usuario,
        ]).catch((e) => console.error("No se pudo actualizar ultimo_acceso:", e));

        const payload = {
            id_usuario: usuario.id_usuario,
            nombre_usuario: usuario.nombre_usuario,
            institucion: usuario.institucion,
            id_rol: usuario.id_rol,
            nombre_rol: usuario.nombre_rol,
            nivel_acceso: usuario.nivel_acceso,
        };

        const token = this.generarToken(payload);

        // Nunca devolver el hash de la contraseña al cliente
        delete usuario.password_hash;

        return { usuario, token };
    }

    // ------------------------------------------------------------
    // JWT
    // ------------------------------------------------------------
    generarToken(payload) {
        return jwt.sign(payload, this.JWT_SECRET, { expiresIn: this.JWT_EXPIRES_IN });
    }

    verificarToken(token) {
        // jwt.verify lanza si el token es inválido o expiró;
        // dejamos que el middleware capture ese error.
        return jwt.verify(token, this.JWT_SECRET);
    }

    // ------------------------------------------------------------
    // Utilidad compartida con UserService
    // ------------------------------------------------------------
    async obtenerPerfilPorId(id_usuario) {
        const db = connect();
        const [filas] = await db.query(
            `SELECT u.id_usuario, u.nombre_usuario, u.nombre_completo, u.correo,
                    u.institucion, u.estado, u.fecha_creacion, u.ultimo_acceso,
                    r.id_rol, r.nombre_rol, r.nivel_acceso
               FROM usuarios u
               JOIN roles r ON r.id_rol = u.id_rol
              WHERE u.id_usuario = ?
              LIMIT 1`,
            [id_usuario]
        );
        return filas[0] ?? null;
    }
}

export default AuthService;