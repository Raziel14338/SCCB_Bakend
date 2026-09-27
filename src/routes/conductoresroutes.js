import { Router } from "express";
import ConductoresController from "../controlers/conductorescontroller.js";

const router = Router();
const conductoresController = new ConductoresController();

router.post("/conductores", conductoresController.registrarConductor);
router.get("/obtener/conductores", conductoresController.listarConductores);
router.get("/conductores/:id", conductoresController.obtenerConductorPorId);
router.patch("/conductores/:id/estado", conductoresController.actualizarEstadoConductor);

export default router;