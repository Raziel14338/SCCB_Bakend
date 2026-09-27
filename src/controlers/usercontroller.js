import UserService from "../services/userservice";

/**
 * UserController
 * ------------------------------------------------------------------
 * CRUD básico de personal (usuarios): consultar perfil, listar por
 * rol/institución y desactivar. No borra usuarios físicamente: por
 * trazabilidad (los despachos/alertas referencian id_usuario), se
 * usa baja lógica vía el campo `estado`.
 * ------------------------------------------------------------------
 */
class UserController {
    constructor() {
        this.userService = new UserService();
    }

    // GET /users/:id
    obtenerPerfilPorId = async (req, res) => {
        const { id } = req.params;

        try {
            const usuario = await this.userService.obtenerPorId(id);

            if (!usuario) {
                return res.status(404).json({
                    error: `No se encontró un usuario con id ${id}.`,
                });
            }

            return res.json({ usuario });
        } catch (err) {
            console.error("Error al consultar usuario:", err);
            return res.status(500).json({ error: "Error interno al consultar el usuario." });
        }
    };

    // GET /users?rol=FISCAL_ANH&institucion=ANH
    listarUsuariosPorRol = async (req, res) => {
        const { rol, id_rol, institucion } = req.query;

        try {
            const usuarios = await this.userService.listarPorRol({
                nombre_rol: rol,
                id_rol,
                institucion,
            });

            return res.json({ total: usuarios.length, usuarios });
        } catch (err) {
            console.error("Error al listar usuarios:", err);
            return res.status(500).json({ error: "Error interno al listar los usuarios." });
        }
    };

    // PATCH /users/:id/desactivar
    desactivarUsuario = async (req, res) => {
        const { id } = req.params;

        try {
            const usuario = await this.userService.actualizarEstado(id, "INACTIVO");
            return res.json({ mensaje: "Usuario desactivado correctamente.", usuario });
        } catch (err) {
            console.error("Error al desactivar usuario:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al desactivar el usuario.",
            });
        }
    };

    // PATCH /users/:id/reactivar
    reactivarUsuario = async (req, res) => {
        const { id } = req.params;

        try {
            const usuario = await this.userService.actualizarEstado(id, "ACTIVO");
            return res.json({ mensaje: "Usuario reactivado correctamente.", usuario });
        } catch (err) {
            console.error("Error al reactivar usuario:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al reactivar el usuario.",
            });
        }
    };
}

export default UserController;