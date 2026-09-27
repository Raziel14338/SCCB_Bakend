import InventarioService from "../services/inventarioservice";

/**
 * InventarioController
 * ------------------------------------------------------------------
 * Protocolo HTTP para transferencias de inventario y despachos. Toda
 * la lógica (incluida la transacción y la llamada a CuposService)
 * vive en InventarioService.
 * ------------------------------------------------------------------
 */
class InventarioController {
    constructor() {
        this.inventarioService = new InventarioService();
    }

    // ================== INVENTARIO ==================

    // POST /inventario/transferencia
    registrarTransferencia = async (req, res) => {
        const {
            id_centro_acopio,
            id_estacion,
            id_cisterna,
            tipo_combustible,
            volumen,
            documento_referencia,
            id_usuario_registro,
        } = req.body;

        if (!id_centro_acopio || !id_estacion || !tipo_combustible || !volumen || !id_usuario_registro) {
            return res.status(400).json({
                error:
                    "Los campos id_centro_acopio, id_estacion, tipo_combustible, volumen e id_usuario_registro son requeridos.",
            });
        }

        try {
            const resultado = await this.inventarioService.registrarTransferencia({
                id_centro_acopio,
                id_estacion,
                id_cisterna,
                tipo_combustible,
                volumen,
                documento_referencia,
                id_usuario_registro,
            });

            return res.status(201).json({ mensaje: "Transferencia registrada exitosamente.", ...resultado });
        } catch (err) {
            console.error("Error al registrar transferencia:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al registrar la transferencia.",
            });
        }
    };

    // GET /obtener/inventario?id_centro_acopio=&id_estacion=&tipo_movimiento=
    listarInventario = async (req, res) => {
        const { id_centro_acopio, id_estacion, tipo_movimiento } = req.query;

        try {
            const movimientos = await this.inventarioService.listarInventario({
                id_centro_acopio,
                id_estacion,
                tipo_movimiento,
            });

            return res.json({ total: movimientos.length, movimientos });
        } catch (err) {
            console.error("Error al listar inventario:", err);
            return res.status(500).json({ error: "Error interno al listar el inventario." });
        }
    };

    // ================== DESPACHOS ==================

    // POST /despachos
    registrarDespacho = async (req, res) => {
        const {
            id_surtidor,
            rfid_tag_o_placa,
            id_conductor,
            id_usuario_operador,
            volumen_despachado,
            metodo_identificacion,
        } = req.body;

        if (!id_surtidor || !rfid_tag_o_placa || !id_conductor || !id_usuario_operador || !volumen_despachado) {
            return res.status(400).json({
                error:
                    "Los campos id_surtidor, rfid_tag_o_placa, id_conductor, id_usuario_operador y volumen_despachado son requeridos.",
            });
        }

        try {
            const despacho = await this.inventarioService.registrarDespacho({
                id_surtidor,
                rfid_tag_o_placa,
                id_conductor,
                id_usuario_operador,
                volumen_despachado,
                metodo_identificacion,
            });

            return res.status(201).json({ mensaje: "Despacho autorizado y registrado.", despacho });
        } catch (err) {
            // Cuando el cupo se deniega, el Service ya dejó constancia del
            // intento en `despachos` con estado_transaccion = 'DENEGADO';
            // aquí solo devolvemos el código HTTP correcto (403/409/404).
            console.error("Error al registrar despacho:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al registrar el despacho.",
            });
        }
    };

    // GET /obtener/despachos?id_surtidor=&id_vehiculo=&estado_transaccion=
    listarDespachos = async (req, res) => {
        const { id_surtidor, id_vehiculo, estado_transaccion } = req.query;

        try {
            const despachos = await this.inventarioService.listarDespachos({
                id_surtidor,
                id_vehiculo,
                estado_transaccion,
            });

            return res.json({ total: despachos.length, despachos });
        } catch (err) {
            console.error("Error al listar despachos:", err);
            return res.status(500).json({ error: "Error interno al listar los despachos." });
        }
    };
}

export default InventarioController;