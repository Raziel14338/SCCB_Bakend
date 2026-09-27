import ReportesService from "../services/reportesservice.js";

/**
 * ReportesController
 * ------------------------------------------------------------------
 * Todos los endpoints son GET y de solo lectura: alimentan dashboards,
 * nunca modifican datos. La validación aquí es liviana (formato de
 * fecha), ya que no hay body que validar.
 * ------------------------------------------------------------------
 */
class ReportesController {
    constructor() {
        this.reportesService = new ReportesService();
    }

    // GET /reportes/estadisticas?fecha=YYYY-MM-DD
    obtenerEstadisticasGenerales = async (req, res) => {
        const { fecha } = req.query;

        if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            return res.status(400).json({ error: "El parámetro fecha debe tener formato YYYY-MM-DD." });
        }

        try {
            const estadisticas = await this.reportesService.estadisticasGenerales(fecha);
            return res.json({ estadisticas });
        } catch (err) {
            console.error("Error al obtener estadísticas generales:", err);
            return res.status(500).json({ error: "Error interno al obtener las estadísticas." });
        }
    };

    // GET /reportes/cruce-volumetrico?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
    obtenerCruceVolumetrico = async (req, res) => {
        const { fecha_inicio, fecha_fin } = req.query;

        const formatoValido = /^\d{4}-\d{2}-\d{2}$/;
        if (
            (fecha_inicio && !formatoValido.test(fecha_inicio)) ||
            (fecha_fin && !formatoValido.test(fecha_fin))
        ) {
            return res.status(400).json({
                error: "fecha_inicio y fecha_fin deben tener formato YYYY-MM-DD.",
            });
        }

        try {
            const cruce = await this.reportesService.cruceVolumetrico({ fecha_inicio, fecha_fin });

            const totalMermaLitros = cruce.reduce((acc, fila) => acc + fila.diferencia_litros, 0);

            return res.json({
                total_registros: cruce.length,
                total_merma_litros: Number(totalMermaLitros.toFixed(2)),
                cruce,
            });
        } catch (err) {
            console.error("Error al calcular cruce volumétrico:", err);
            return res.status(500).json({ error: "Error interno al calcular el cruce volumétrico." });
        }
    };
}

export default ReportesController;