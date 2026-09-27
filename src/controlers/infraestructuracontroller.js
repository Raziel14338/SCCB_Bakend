import InfraestructuraService from "../services/infraestructuraservice";

/**
 * InfraestructuraController
 * ------------------------------------------------------------------
 * Solo protocolo HTTP: valida presencia de campos, llama a
 * InfraestructuraService y traduce el resultado (o el error con
 * `.status`) a una respuesta JSON. Ninguna consulta SQL vive aquí.
 * ------------------------------------------------------------------
 */
class InfraestructuraController {
    constructor() {
        this.infraestructuraService = new InfraestructuraService();
    }

    // ================== CENTROS DE ACOPIO ==================

    // POST /centros-acopio
    crearCentroAcopio = async (req, res) => {
        const { nombre, ubicacion, latitud, longitud, capacidad_almacen } = req.body;

        if (!nombre || !ubicacion || !capacidad_almacen) {
            return res.status(400).json({
                error: "Los campos nombre, ubicacion y capacidad_almacen son requeridos.",
            });
        }

        try {
            const centro = await this.infraestructuraService.crearCentroAcopio({
                nombre, ubicacion, latitud, longitud, capacidad_almacen,
            });

            return res.status(201).json({ mensaje: "Centro de acopio registrado exitosamente.", centro });
        } catch (err) {
            console.error("Error al crear centro de acopio:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al crear el centro de acopio.",
            });
        }
    };

    // GET /centros-acopio/:id
    obtenerCentroAcopio = async (req, res) => {
        const { id } = req.params;

        try {
            const centro = await this.infraestructuraService.obtenerCentroAcopioPorId(id);

            if (!centro) {
                return res.status(404).json({ error: `No se encontró un centro de acopio con ID ${id}.` });
            }

            return res.json({ centro });
        } catch (err) {
            console.error("Error al obtener centro de acopio:", err);
            return res.status(500).json({ error: "Error interno al obtener el centro de acopio." });
        }
    };

    // GET /obtener/centros-acopio?estado=OPERATIVO
    listarCentrosAcopio = async (req, res) => {
        const { estado } = req.query;

        try {
            const centros = await this.infraestructuraService.listarCentrosAcopio({ estado });
            return res.json({ total: centros.length, centros });
        } catch (err) {
            console.error("Error al listar centros de acopio:", err);
            return res.status(500).json({ error: "Error interno al listar los centros de acopio." });
        }
    };

    // PUT /centros-acopio/:id
    actualizarCentroAcopio = async (req, res) => {
        const { id } = req.params;

        try {
            const centro = await this.infraestructuraService.actualizarCentroAcopio(id, req.body);
            return res.json({ mensaje: "Centro de acopio actualizado correctamente.", centro });
        } catch (err) {
            console.error("Error al actualizar centro de acopio:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al actualizar el centro de acopio.",
            });
        }
    };

    // DELETE /centros-acopio/:id
    eliminarCentroAcopio = async (req, res) => {
        const { id } = req.params;

        try {
            const resultado = await this.infraestructuraService.eliminarCentroAcopio(id);
            return res.json({ mensaje: "Centro de acopio eliminado correctamente.", ...resultado });
        } catch (err) {
            console.error("Error al eliminar centro de acopio:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al eliminar el centro de acopio.",
            });
        }
    };

    // ================== ESTACIONES DE SERVICIO ==================

    // POST /estaciones
    crearEstacion = async (req, res) => {
        const { nombre, codigo_ypfb, ubicacion, latitud, longitud } = req.body;

        if (!nombre || !codigo_ypfb || !ubicacion) {
            return res.status(400).json({
                error: "Los campos nombre, codigo_ypfb y ubicacion son requeridos.",
            });
        }

        try {
            const estacion = await this.infraestructuraService.crearEstacion({
                nombre, codigo_ypfb, ubicacion, latitud, longitud,
            });

            return res.status(201).json({ mensaje: "Estación registrada exitosamente.", estacion });
        } catch (err) {
            console.error("Error al crear estación:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al crear la estación.",
            });
        }
    };

    // GET /estaciones/:id
    obtenerEstacion = async (req, res) => {
        const { id } = req.params;

        try {
            const estacion = await this.infraestructuraService.obtenerEstacionPorId(id);

            if (!estacion) {
                return res.status(404).json({ error: `No se encontró una estación con ID ${id}.` });
            }

            return res.json({ estacion });
        } catch (err) {
            console.error("Error al obtener estación:", err);
            return res.status(500).json({ error: "Error interno al obtener la estación." });
        }
    };

    // GET /obtener/estaciones?estado=OPERATIVA
    listarEstaciones = async (req, res) => {
        const { estado } = req.query;

        try {
            const estaciones = await this.infraestructuraService.listarEstaciones({ estado });
            return res.json({ total: estaciones.length, estaciones });
        } catch (err) {
            console.error("Error al listar estaciones:", err);
            return res.status(500).json({ error: "Error interno al listar las estaciones." });
        }
    };

    // PUT /estaciones/:id
    actualizarEstacion = async (req, res) => {
        const { id } = req.params;

        try {
            const estacion = await this.infraestructuraService.actualizarEstacion(id, req.body);
            return res.json({ mensaje: "Estación actualizada correctamente.", estacion });
        } catch (err) {
            console.error("Error al actualizar estación:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al actualizar la estación.",
            });
        }
    };

    // DELETE /estaciones/:id
    eliminarEstacion = async (req, res) => {
        const { id } = req.params;

        try {
            const resultado = await this.infraestructuraService.eliminarEstacion(id);
            return res.json({ mensaje: "Estación eliminada correctamente.", ...resultado });
        } catch (err) {
            console.error("Error al eliminar estación:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al eliminar la estación.",
            });
        }
    };

    // ================== SURTIDORES ==================

    // POST /surtidores
    crearSurtidor = async (req, res) => {
        const { id_estacion, numero_surtidor, tipo_combustible, tiene_ocr, tiene_rfid } = req.body;

        if (!id_estacion || !numero_surtidor || !tipo_combustible) {
            return res.status(400).json({
                error: "Los campos id_estacion, numero_surtidor y tipo_combustible son requeridos.",
            });
        }

        try {
            const surtidor = await this.infraestructuraService.crearSurtidor({
                id_estacion, numero_surtidor, tipo_combustible, tiene_ocr, tiene_rfid,
            });

            return res.status(201).json({ mensaje: "Surtidor registrado exitosamente.", surtidor });
        } catch (err) {
            console.error("Error al crear surtidor:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al crear el surtidor.",
            });
        }
    };

    // GET /estaciones/:id_estacion/surtidores
    listarSurtidoresPorEstacion = async (req, res) => {
        const { id_estacion } = req.params;

        try {
            const surtidores = await this.infraestructuraService.listarSurtidoresPorEstacion(id_estacion);
            return res.json({ total: surtidores.length, surtidores });
        } catch (err) {
            console.error("Error al listar surtidores:", err);
            return res.status(500).json({ error: "Error interno al listar los surtidores." });
        }
    };

    // GET /obtener/surtidores  (todas las estaciones, con nombre_estacion)
    listarTodosSurtidores = async (req, res) => {
        try {
            const surtidores = await this.infraestructuraService.listarTodosSurtidores();
            return res.json({ total: surtidores.length, surtidores });
        } catch (err) {
            console.error("Error al listar surtidores:", err);
            return res.status(500).json({ error: "Error interno al listar los surtidores." });
        }
    };
}

export default InfraestructuraController;