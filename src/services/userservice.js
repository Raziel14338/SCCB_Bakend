import { connect } from "../database";

/**
 * UserService
 * ------------------------------------------------------------------
 * Lógica de negocio/SQL para la gestión de personal (tabla `usuarios`).
 * No conoce nada de HTTP; UserController traduce estos resultados
 * (o los errores con `err.status`) a respuestas JSON.
 * ------------------------------------------------------------------
 */
class UserService {
    // GET /users/:id
    async obtenerPorId(id_usuario) {
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

    // GET /users?rol=FISCAL_ANH  (acepta id_rol o nombre_rol)
    async listarPorRol({ id_rol, nombre_rol, institucion } = {}) {
        const db = connect();

        const condiciones = [];
        const parametros = [];

        if (id_rol) {
            condiciones.push("r.id_rol = ?");
            parametros.push(id_rol);
        }

        if (nombre_rol) {
            condiciones.push("r.nombre_rol = ?");
            parametros.push(nombre_rol);
        }

        if (institucion) {
            condiciones.push("u.institucion = ?");
            parametros.push(institucion);
        }

        const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

        const [filas] = await db.query(
            `SELECT u.id_usuario, u.nombre_usuario, u.nombre_completo, u.correo,
                    u.institucion, u.estado, u.fecha_creacion, u.ultimo_acceso,
                    r.id_rol, r.nombre_rol
               FROM usuarios u
               JOIN roles r ON r.id_rol = u.id_rol
               ${where}
              ORDER BY u.nombre_completo ASC`,
            parametros
        );

        return filas;
    }

    // PATCH /users/:id/estado  (usado por desactivarUsuario)
    async actualizarEstado(id_usuario, estado) {
        const db = connect();

        const [existe] = await db.query(
            "SELECT id_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1",
            [id_usuario]
        );

        if (existe.length === 0) {
            const err = new Error(`No se encontró un usuario con id ${id_usuario}.`);
            err.status = 404;
            throw err;
        }

        await db.query("UPDATE usuarios SET estado = ? WHERE id_usuario = ?", [
            estado,
            id_usuario,
        ]);

        return this.obtenerPorId(id_usuario);
    }
}

export default UserService;