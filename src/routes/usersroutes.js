import { Router } from "express";
import UserController from "../controlers/usercontroller.js";
import { verificarToken, verificarRol } from "../middlewares/authmiddleware.js";

const router = Router();
const userController = new UserController();

// Todas las rutas de este módulo requieren estar autenticado
router.use("/users", verificarToken);

router.get("/lista/users", userController.listarUsuariosPorRol);
router.get("/users/:id", userController.obtenerPerfilPorId);

// Solo un administrador de red o de sistema puede dar de baja/alta a otro usuario
router.patch(
    "/users/:id/desactivar",
    verificarRol("ADMIN_RED"),
    userController.desactivarUsuario
);
router.patch(
    "/users/:id/reactivar",
    verificarRol("ADMIN_RED"),
    userController.reactivarUsuario
);

export default router;