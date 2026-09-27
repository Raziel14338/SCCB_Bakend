import { Router } from "express";
import InfraestructuraController from "../controlers/infraestructuracontroller";
import InventarioController from "../controlers/inventariocontroller";

const router = Router();
const infraestructuraController = new InfraestructuraController();
const inventarioController = new InventarioController();

// ---------------- Centros de Acopio ----------------
router.post("/centros-acopio", infraestructuraController.crearCentroAcopio);
router.get("/obtener/centros-acopio", infraestructuraController.listarCentrosAcopio);
router.get("/centros-acopio/:id", infraestructuraController.obtenerCentroAcopio);
router.put("/centros-acopio/:id", infraestructuraController.actualizarCentroAcopio);
router.delete("/centros-acopio/:id", infraestructuraController.eliminarCentroAcopio);

// ---------------- Estaciones de Servicio ----------------
router.post("/estaciones", infraestructuraController.crearEstacion);
router.get("/obtener/estaciones", infraestructuraController.listarEstaciones);
router.get("/estaciones/:id", infraestructuraController.obtenerEstacion);
router.put("/estaciones/:id", infraestructuraController.actualizarEstacion);
router.delete("/estaciones/:id", infraestructuraController.eliminarEstacion);

// ---------------- Surtidores ----------------
router.post("/surtidores", infraestructuraController.crearSurtidor);
router.get("/obtener/surtidores", infraestructuraController.listarTodosSurtidores);
router.get("/estaciones/:id_estacion/surtidores", infraestructuraController.listarSurtidoresPorEstacion);

// ---------------- Inventario (transferencias acopio -> estación) ----------------
router.post("/inventario/transferencia", inventarioController.registrarTransferencia);
router.get("/obtener/inventario", inventarioController.listarInventario);

// ---------------- Despachos (ventas a vehículos) ----------------
router.post("/despachos", inventarioController.registrarDespacho);
router.get("/obtener/despachos", inventarioController.listarDespachos);

export default router;