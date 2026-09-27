import { Router } from "express";
import TelemetriaController from "../controlers/telemetriacontroller.js";

const router = Router();
const telemetriaController = new TelemetriaController();

// Ingesta de datos del sensor (ESP32 / puente serial de Proteus)
router.post("/telemetria/registro", telemetriaController.registrarTelemetria);

// Último punto conocido de una cisterna (para el dashboard / mapa en vivo)
router.get("/telemetria/cisterna/:id_cisterna", telemetriaController.obtenerUltimoEstado);

// Historial reciente, para dibujar la ruta recorrida en un mapa
router.get("/telemetria/cisterna/:id_cisterna/historial", telemetriaController.obtenerHistorial);

export default router;