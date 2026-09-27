import { Router } from "express";
import VehiculosController from "../controlers/vehiculoscontroller.js";

const router = Router();
const vehiculosController = new VehiculosController();

router.post("/vehiculos", vehiculosController.registrarVehiculo);
router.get("/obtener/vehiculos", vehiculosController.listarVehiculos);
router.get("/vehiculos/placa/:placa", vehiculosController.obtenerVehiculoPorPlaca);
router.get("/vehiculos/rfid/:rfid_tag", vehiculosController.obtenerVehiculoPorRfid);
router.patch("/vehiculos/:placa/estado", vehiculosController.actualizarEstadoVehiculo);

export default router;