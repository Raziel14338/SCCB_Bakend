import AlertasService from "../services/alertasservice.js";

const TIPOS_ALERTA_VALIDOS = [
    "MERMA_IRREGULAR",
    "DESVIO_RUTA",
    "TIEMPO_MUERTO",
    "DISCREPANCIA_VOLUMEN",
    "CUPO_EXCEDIDO",
    "CREDENCIAL_DUPLICADA",
    "ACCESO_NO_AUTORIZADO",
];
const SEVERIDADES_VALIDAS = ["BAJA", "MEDIA", "ALTA", "CRITICA"];
const ESTADOS_VALIDOS = ["ABIERTA", "EN_REVISION", "RESUELTA", "DESCARTADA"];

/**
 * AlertasController
 * ------------------------------------------------------------------
 * Solo protocolo HTTP: valida presencia y pertenencia a los ENUM de
 * la tabla antes de llamar al Service, para devolver un 400 claro en
 * vez de dejar que MySQL rechace el INSERT/UPDATE con un error críptico.
 * ------------------------------------------------------------------
 */
class AlertasController {
    constructor() {
        this.alertasService = new AlertasService();
    }

    // POST /alertas
    registrarAlerta = async (req, res) => {
        const { tipo_alerta, descripcion, severidad, id_cisterna, id_vehiculo, id_estacion } =
            req.body;

        if (!tipo_alerta || !descripcion) {
            return res.status(400).json({
                error: "Los campos tipo_alerta y descripcion son requeridos.",
            });
        }

        if (!TIPOS_ALERTA_VALIDOS.includes(tipo_alerta)) {
            return res.status(400).json({
                error: `tipo_alerta debe ser uno de: ${TIPOS_ALERTA_VALIDOS.join(", ")}.`,
            });
        }

        if (severidad && !SEVERIDADES_VALIDAS.includes(severidad)) {
            return res.status(400).json({
                error: `severidad debe ser una de: ${SEVERIDADES_VALIDAS.join(", ")}.`,
            });
        }

        if (!id_cisterna && !id_vehiculo && !id_estacion) {
            return res.status(400).json({
                error:
                    "Debe indicarse al menos una referencia: id_cisterna, id_vehiculo o id_estacion.",
            });
        }

        try {
            const alerta = await this.alertasService.registrar({
                tipo_alerta,
                descripcion,
                severidad,
                id_cisterna,
                id_vehiculo,
                id_estacion,
            });

            return res.status(201).json({ mensaje: "Alerta registrada.", alerta });
        } catch (err) {
            console.error("Error al registrar alerta:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al registrar la alerta.",
            });
        }
    };

    // GET /alertas/:id
    obtenerAlertaPorId = async (req, res) => {
        const { id } = req.params;

        try {
            const alerta = await this.alertasService.obtenerPorId(id);

            if (!alerta) {
                return res.status(404).json({ error: `No se encontró una alerta con id ${id}.` });
            }

            return res.json({ alerta });
        } catch (err) {
            console.error("Error al consultar alerta:", err);
            return res.status(500).json({ error: "Error interno al consultar la alerta." });
        }
    };

    // GET /alertas?estado=ABIERTA,EN_REVISION&severidad=CRITICA,ALTA
    listarAlertas = async (req, res) => {
        const { estado, severidad } = req.query;

        try {
            const alertas = await this.alertasService.listar({ estado, severidad });
            return res.json({ total: alertas.length, alertas });
        } catch (err) {
            console.error("Error al listar alertas:", err);
            return res.status(500).json({ error: "Error interno al listar las alertas." });
        }
    };

    // PATCH /alertas/:id/estado
    actualizarEstadoAlerta = async (req, res) => {
        const { id } = req.params;
        const { estado, id_usuario_resolucion } = req.body;

        if (!estado || !ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({
                error: `El campo estado es requerido y debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}.`,
            });
        }

        try {
            const alerta = await this.alertasService.actualizarEstado(id, {
                estado,
                id_usuario_resolucion,
            });

            return res.json({ mensaje: "Estado de la alerta actualizado.", alerta });
        } catch (err) {
            console.error("Error al actualizar estado de alerta:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al actualizar la alerta.",
            });
        }
    };
}

export default AlertasController;