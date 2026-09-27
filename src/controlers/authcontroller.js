import AuthService from "../services/authservice.js";

/**
 * AuthController
 * ------------------------------------------------------------------
 * Igual que CisternasController: solo protocolo HTTP. Toda la lógica
 * de bcrypt/JWT/SQL vive en AuthService. Los métodos se declaran como
 * class fields (arrow function) para poder pasarlos directo a
 * router.post/get sin .bind(this).
 * ------------------------------------------------------------------
 */
class AuthController {
    constructor() {
        this.authService = new AuthService();
    }

    // POST /auth/registro
    registrar = async (req, res) => {
        const { nombre_usuario, password, nombre_completo, correo, institucion, id_rol } =
            req.body;

        if (!nombre_usuario || !password || !nombre_completo || !correo || !institucion || !id_rol) {
            return res.status(400).json({
                error:
                    "Los campos nombre_usuario, password, nombre_completo, correo, institucion e id_rol son requeridos.",
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: "La contraseña debe tener al menos 8 caracteres.",
            });
        }

        try {
            const usuario = await this.authService.registrar({
                nombre_usuario,
                password,
                nombre_completo,
                correo,
                institucion,
                id_rol,
            });

            return res.status(201).json({
                mensaje: "Usuario registrado exitosamente.",
                usuario,
            });
        } catch (err) {
            console.error("Error al registrar usuario:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al registrar el usuario.",
            });
        }
    };

    // POST /auth/login
    login = async (req, res) => {
        const { nombre_usuario, password } = req.body;

        if (!nombre_usuario || !password) {
            return res.status(400).json({
                error: "Los campos nombre_usuario y password son requeridos.",
            });
        }

        try {
            const { usuario, token } = await this.authService.login({ nombre_usuario, password });

            return res.json({
                mensaje: "Inicio de sesión exitoso.",
                token,
                usuario,
            });
        } catch (err) {
            console.error("Error al iniciar sesión:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al iniciar sesión.",
            });
        }
    };

    // GET /auth/perfil  (requiere authMiddleware -> req.usuario viene del JWT)
    perfil = async (req, res) => {
        try {
            const usuario = await this.authService.obtenerPerfilPorId(req.usuario.id_usuario);

            if (!usuario) {
                return res.status(404).json({ error: "Usuario no encontrado." });
            }

            return res.json({ usuario });
        } catch (err) {
            console.error("Error al obtener perfil:", err);
            return res.status(500).json({ error: "Error interno al obtener el perfil." });
        }
    };
}

export default AuthController;