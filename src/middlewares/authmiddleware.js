import AuthService from "../services/authservice";

const authService = new AuthService();

/**
 * verificarToken
 * ------------------------------------------------------------------
 * Middleware que exige un header "Authorization: Bearer <token>".
 * Si es válido, decodifica el payload del JWT en req.usuario y deja
 * pasar la petición; si no, corta con 401.
 *
 * Uso:
 *   router.get("/users/:id", verificarToken, userController.obtenerPerfilPorId);
 * ------------------------------------------------------------------
 */
export function verificarToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Token no proporcionado. Use el header Authorization: Bearer <token>.",
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const payload = authService.verificarToken(token);
        req.usuario = payload; // { id_usuario, nombre_usuario, id_rol, nombre_rol, nivel_acceso, ... }
        return next();
    } catch (err) {
        const mensaje =
            err.name === "TokenExpiredError"
                ? "El token ha expirado. Inicie sesión nuevamente."
                : "Token inválido.";
        return res.status(401).json({ error: mensaje });
    }
}

/**
 * verificarRol
 * ------------------------------------------------------------------
 * Factory de middleware para restringir el acceso a ciertos roles.
 * Debe usarse SIEMPRE después de verificarToken.
 *
 * Uso:
 *   router.patch(
 *     "/users/:id/desactivar",
 *     verificarToken,
 *     verificarRol("ADMIN_RED"),
 *     userController.desactivarUsuario
 *   );
 * ------------------------------------------------------------------
 */
export function verificarRol(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({ error: "No autenticado." });
        }

        if (!rolesPermitidos.includes(req.usuario.nombre_rol)) {
            return res.status(403).json({
                error: "No tiene permisos suficientes para realizar esta acción.",
            });
        }

        return next();
    };
}