import ConductorService from "../services/conductorservice.js";

/**
 * ConductoresController
 * ------------------------------------------------------------------
 * Solo protocolo HTTP. Nunca ve la clave de cifrado ni sabe cómo se
 * protege la CI: eso es responsabilidad exclusiva de ConductorService.
 * ------------------------------------------------------------------
 */
class ConductoresController {
    constructor() {
        this.conductorService = new ConductorService();
    }

    // POST /conductores
    registrarConductor = async (req, res) => {
        const { nombre_completo, ci, licencia_conducir, telefono } = req.body;

        if (!nombre_completo || !ci) {
            return res.status(400).json({
                error: "Los campos nombre_completo y ci son requeridos.",
            });
        }

        try {
            const conductor = await this.conductorService.crear({
                nombre_completo,
                ci,
                licencia_conducir,
                telefono,
            });

            return res.status(201).json({
                mensaje: "Conductor registrado exitosamente.",
                conductor,
            });
        } catch (err) {
            console.error("Error al registrar conductor:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al registrar el conductor.",
            });
        }
    };

    // GET /conductores/:id
    obtenerConductorPorId = async (req, res) => {
        const { id } = req.params;

        try {
            const conductor = await this.conductorService.obtenerPorId(id);

            if (!conductor) {
                return res.status(404).json({
                    error: `No se encontró un conductor con id ${id}.`,
                });
            }

            return res.json({ conductor });
        } catch (err) {
            console.error("Error al consultar conductor:", err);
            return res.status(500).json({ error: "Error interno al consultar el conductor." });
        }
    };

    // GET /obtener/conductores?estado=ACTIVO
    listarConductores = async (req, res) => {
        const { estado } = req.query;

        try {
            const conductores = await this.conductorService.listar({ estado });
            return res.json({ total: conductores.length, conductores });
        } catch (err) {
            console.error("Error al listar conductores:", err);
            return res.status(500).json({ error: "Error interno al listar los conductores." });
        }
    };

    // PATCH /conductores/:id/estado
    actualizarEstadoConductor = async (req, res) => {
        const { id } = req.params;
        const { estado } = req.body;

        const estadosValidos = ["ACTIVO", "INACTIVO"];
        if (!estado || !estadosValidos.includes(estado)) {
            return res.status(400).json({
                error: `El campo estado es requerido y debe ser uno de: ${estadosValidos.join(", ")}.`,
            });
        }

        try {
            const conductor = await this.conductorService.actualizarEstado(id, estado);
            return res.json({ mensaje: "Estado actualizado correctamente.", conductor });
        } catch (err) {
            console.error("Error al actualizar estado de conductor:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al actualizar el conductor.",
            });
        }
    };
}

export default ConductoresController;