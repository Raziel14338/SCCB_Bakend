import { Router } from "express";
import AuthController from "../controlers/authcontroller.js";
import { verificarToken } from "../middlewares/authmiddleware.js";

const router = Router();
const authController = new AuthController();

router.post("/auth/registro", authController.registrar);
router.post("/auth/login", authController.login);
router.get("/auth/perfil", verificarToken, authController.perfil);

export default router;