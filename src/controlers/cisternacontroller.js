import CisternaService from "../services/cisternaservice";

/**
 * CisternasController
 * ------------------------------------------------------------------
 * Recibe la petición HTTP, valida lo mínimo indispensable (presencia
 * de campos) y delega toda la lógica de negocio/SQL a CisternaService.
 * El controlador queda enfocado únicamente en el protocolo HTTP:
 * status codes, req.body/req.params y la forma de la respuesta JSON,
 * igual que en tus controladores anteriores (users.js).
 *
 * Los métodos se declaran como "class fields" (=> arrow function) en
 * vez de métodos normales de clase. Esto fija el valor de `this` al
 * momento de crear la instancia, así que se pueden pasar directo a
 * router.get/post sin necesidad de un wrapper ni de .bind(this):
 *
 *     router.get("/cisternas/:placa", controller.obtenerCisternaPorPlaca);
 *
 * en vez de
 *
 *     router.get("/cisternas/:placa", (req, res) => controller.obtenerCisternaPorPlaca(req, res));
 * ------------------------------------------------------------------
 */
class CisternasController {
    constructor() {
        this.cisternaService = new CisternaService();
    }

    // POST /cisternas
    registrarCisterna = async (req, res) => {
        const { placa, rfid_tag, empresa_transporte, capacidad_total, sensor_iot_id } = req.body;

        if (!placa || !empresa_transporte || !capacidad_total) {
            return res.status(400).json({
                error: "Los campos placa, empresa_transporte y capacidad_total son requeridos.",
            });
        }

        try {
            const cisterna = await this.cisternaService.crear({
                placa,
                rfid_tag,
                empresa_transporte,
                capacidad_total,
                sensor_iot_id,
            });

            return res.status(201).json({
                mensaje: "Cisterna registrada exitosamente.",
                cisterna,
            });
        } catch (err) {
            console.error("Error al registrar cisterna:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al registrar la cisterna.",
            });
        }
    };

    // GET /cisternas/:placa
    obtenerCisternaPorPlaca = async (req, res) => {
        const { placa } = req.params;

        try {
            const cisterna = await this.cisternaService.obtenerPorPlaca(placa);

            if (!cisterna) {
                return res.status(404).json({
                    error: `No se encontró una cisterna con placa "${placa}".`,
                });
            }

            return res.json({ cisterna });
        } catch (err) {
            console.error("Error al consultar cisterna:", err);
            return res.status(500).json({ error: "Error interno al consultar la cisterna." });
        }
    };

    // GET /cisternas?estado=OPERATIVA
    listarCisternas = async (req, res) => {
        const { estado } = req.query;

        try {
            const cisternas = await this.cisternaService.listar({ estado });
            return res.json({ total: cisternas.length, cisternas });
        } catch (err) {
            console.error("Error al listar cisternas:", err);
            return res.status(500).json({ error: "Error interno al listar las cisternas." });
        }
    };

    // PATCH /cisternas/:placa/estado
    actualizarEstadoCisterna = async (req, res) => {
        const { placa } = req.params;
        const { estado } = req.body;

        const estadosValidos = ["OPERATIVA", "MANTENIMIENTO", "FUERA_DE_SERVICIO"];
        if (!estado || !estadosValidos.includes(estado)) {
            return res.status(400).json({
                error: `El campo estado es requerido y debe ser uno de: ${estadosValidos.join(", ")}.`,
            });
        }

        try {
            const cisterna = await this.cisternaService.actualizarEstado(placa, estado);
            return res.json({ mensaje: "Estado actualizado correctamente.", cisterna });
        } catch (err) {
            console.error("Error al actualizar estado de cisterna:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al actualizar la cisterna.",
            });
        }
    };

    // GET /cisternas/:placa/telemetria  (último punto conocido)
    obtenerUltimaTelemetria = async (req, res) => {
        const { placa } = req.params;

        try {
            const telemetria = await this.cisternaService.obtenerUltimaTelemetria(placa);

            if (!telemetria) {
                return res.status(404).json({
                    error: "Esta cisterna aún no tiene registros de telemetría.",
                });
            }

            return res.json({ telemetria });
        } catch (err) {
            console.error("Error al consultar telemetría:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al consultar la telemetría.",
            });
        }
    };

    // POST /cisternas/:placa/telemetria  (ingesta de un punto IoT)
    registrarTelemetria = async (req, res) => {
        const { placa } = req.params;
        const { latitud, longitud, nivel_carga, flujo_instantaneo, velocidad_kmh, evento } = req.body;

        if (latitud === undefined || longitud === undefined || nivel_carga === undefined) {
            return res.status(400).json({
                error: "Los campos latitud, longitud y nivel_carga son requeridos.",
            });
        }

        try {
            const telemetria = await this.cisternaService.registrarTelemetria(placa, {
                latitud,
                longitud,
                nivel_carga,
                flujo_instantaneo,
                velocidad_kmh,
                evento,
            });

            return res.status(201).json({ mensaje: "Telemetría registrada.", telemetria });
        } catch (err) {
            console.error("Error al registrar telemetría:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al registrar la telemetría.",
            });
        }
    };
}

export default CisternasController;