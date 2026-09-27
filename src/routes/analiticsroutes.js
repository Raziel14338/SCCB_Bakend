import { Router } from "express";
import AlertasController from "../controlers/alertascontroller.js";
import ReportesController from "../controlers/reportescontroller.js";

const router = Router();
const alertasController = new AlertasController();
const reportesController = new ReportesController();

// ---------- Alertas ----------
router.post("/alertas", alertasController.registrarAlerta);
router.get("/alertas", alertasController.listarAlertas);
router.get("/alertas/:id", alertasController.obtenerAlertaPorId);
router.patch("/alertas/:id/estado", alertasController.actualizarEstadoAlerta);

// ---------- Reportes (dashboards YPFB / ANH) ----------
router.get("/reportes/estadisticas", reportesController.obtenerEstadisticasGenerales);
router.get("/reportes/cruce-volumetrico", reportesController.obtenerCruceVolumetrico);

export default router;