import { Router } from "express";
import CisternasController from "../controlers/cisternacontroller";

const router = Router();
const cisternasController = new CisternasController();

// Registro y consulta de cisternas
router.post("/cisternas", cisternasController.registrarCisterna);
router.get("/obtener/cisternas", cisternasController.listarCisternas);
router.get("/cisternas/:placa", cisternasController.obtenerCisternaPorPlaca);
router.patch("/cisternas/:placa/estado", cisternasController.actualizarEstadoCisterna);

// Telemetría IoT (nivel, flujo, geolocalización) de la cisterna
router.get("/cisternas/:placa/telemetria", cisternasController.obtenerUltimaTelemetria);
router.post("/cisternas/:placa/telemetria", cisternasController.registrarTelemetria);

export default router;