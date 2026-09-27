import { Router } from "express";
import CuposController from "../controlers/cupocontroller";

const router = Router();
const cuposController = new CuposController();

router.post("/cupos", cuposController.crearCupo);
router.get("/cupos/vehiculo/:placa", cuposController.listarCuposPorPlaca);
router.get("/cupos/vehiculo/:placa/vigente", cuposController.consultarCupoVigente);
router.post("/cupos/vehiculo/:placa/validar-despacho", cuposController.validarDespacho);

// Chequeo rápido de solo lectura para la pantalla del surtidor
router.get("/cupos/validar/:rfid_tag", cuposController.validarPorRfid);

export default router;