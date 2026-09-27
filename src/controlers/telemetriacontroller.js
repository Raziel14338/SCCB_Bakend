import TelemetriaService from "../services/telemetriaservice.js";

/**
 * TelemetriaController
 * ------------------------------------------------------------------
 * `registrarTelemetria` es el endpoint más "caliente" de todo el
 * sistema: lo llama directamente el firmware del ESP32 (o el puente
 * serial que simula Proteus) cada pocos segundos. Por eso la
 * validación es estricta pero barata (solo chequeos de presencia y
 * tipo, sin lógica de negocio aquí) y la respuesta es corta.
 * ------------------------------------------------------------------
 */
class TelemetriaController {
    constructor() {
        this.telemetriaService = new TelemetriaService();
    }

    // POST /api/telemetria/registro
    registrarTelemetria = async (req, res) => {
        const { id_cisterna, latitud, longitud, nivel_carga, flujo_instantaneo, velocidad_kmh, evento } =
            req.body;

        if (
            id_cisterna === undefined ||
            latitud === undefined ||
            longitud === undefined ||
            nivel_carga === undefined
        ) {
            return res.status(400).json({
                error: "Los campos id_cisterna, latitud, longitud y nivel_carga son requeridos.",
            });
        }

        // Chequeo de tipo básico: un sensor mal calibrado o un parseo
        // erróneo en el ESP32 puede mandar strings ("NaN", "") en vez de
        // números. Mejor rechazar aquí con 400 que insertar basura.
        if ([latitud, longitud, nivel_carga].some((valor) => Number.isNaN(Number(valor)))) {
            return res.status(400).json({
                error: "latitud, longitud y nivel_carga deben ser valores numéricos.",
            });
        }

        try {
            const telemetria = await this.telemetriaService.registrar({
                id_cisterna,
                latitud,
                longitud,
                nivel_carga,
                flujo_instantaneo,
                velocidad_kmh,
                evento,
            });

            return res.status(201).json({ mensaje: "Telemetría registrada.", telemetria });
        } catch (err) {
            console.error("Error al registrar telemetría IoT:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al registrar la telemetría.",
            });
        }
    };

    // GET /api/telemetria/cisterna/:id_cisterna
    obtenerUltimoEstado = async (req, res) => {
        const { id_cisterna } = req.params;

        try {
            const telemetria = await this.telemetriaService.obtenerUltimoPorCisterna(id_cisterna);

            if (!telemetria) {
                return res.status(404).json({
                    error: "Esta cisterna aún no tiene registros de telemetría.",
                });
            }

            return res.json({ telemetria });
        } catch (err) {
            console.error("Error al consultar último estado de telemetría:", err);
            return res.status(500).json({ error: "Error interno al consultar la telemetría." });
        }
    };

    // GET /api/telemetria/cisterna/:id_cisterna/historial?limite=50
    obtenerHistorial = async (req, res) => {
        const { id_cisterna } = req.params;
        const { limite } = req.query;

        try {
            const historial = await this.telemetriaService.obtenerHistorial(
                id_cisterna,
                limite ? Number(limite) : undefined
            );

            return res.json({ total: historial.length, historial });
        } catch (err) {
            console.error("Error al consultar historial de telemetría:", err);
            return res.status(500).json({ error: "Error interno al consultar el historial." });
        }
    };
}

export default TelemetriaController;