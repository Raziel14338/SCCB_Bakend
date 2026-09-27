import CupoService from "../services/cuposervice.js";

/**
 * CuposController
 * ------------------------------------------------------------------
 * Igual que CisternasController: HTTP en el controlador, SQL/negocio
 * en el Service. El método más importante es `validarDespacho`, que es
 * el que llamaría el surtidor (o el backend que lo representa) justo
 * antes de dejar salir combustible: consulta y descuenta el cupo en
 * una sola operación atómica.
 *
 * `validarPorRfid` es distinto: solo lectura, pensado para pintar el
 * semáforo en pantalla antes de que el operador confirme el volumen.
 * ------------------------------------------------------------------
 */
class CuposController {
    constructor() {
        this.cupoService = new CupoService();
    }

    // POST /cupos
    crearCupo = async (req, res) => {
        const { placa, volumen_autorizado, periodo, fecha_inicio, fecha_fin } = req.body;

        if (!placa || !volumen_autorizado || !fecha_inicio || !fecha_fin) {
            return res.status(400).json({
                error: "Los campos placa, volumen_autorizado, fecha_inicio y fecha_fin son requeridos.",
            });
        }

        try {
            const cupo = await this.cupoService.crear({
                placa,
                volumen_autorizado,
                periodo,
                fecha_inicio,
                fecha_fin,
            });

            return res.status(201).json({ mensaje: "Cupo registrado exitosamente.", cupo });
        } catch (err) {
            console.error("Error al registrar cupo:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al registrar el cupo.",
            });
        }
    };

    // GET /cupos/vehiculo/:placa  (historial completo)
    listarCuposPorPlaca = async (req, res) => {
        const { placa } = req.params;

        try {
            const cupos = await this.cupoService.listarPorPlaca(placa);
            return res.json({ total: cupos.length, cupos });
        } catch (err) {
            console.error("Error al listar cupos:", err);
            return res.status(500).json({ error: "Error interno al listar los cupos." });
        }
    };

    // GET /cupos/vehiculo/:placa/vigente
    consultarCupoVigente = async (req, res) => {
        const { placa } = req.params;

        try {
            const cupo = await this.cupoService.obtenerCupoVigente(placa);

            if (!cupo) {
                return res.status(404).json({ error: "El vehículo no tiene un cupo vigente." });
            }

            return res.json({ cupo });
        } catch (err) {
            console.error("Error al consultar cupo vigente:", err);
            return res.status(500).json({ error: "Error interno al consultar el cupo." });
        }
    };

    // GET /cupos/validar/:rfid_tag?volumen=30
    // Solo lectura: feedback inmediato para el surtidor antes de confirmar la venta.
    validarPorRfid = async (req, res) => {
        const { rfid_tag } = req.params;
        const volumen = req.query.volumen !== undefined ? Number(req.query.volumen) : null;

        try {
            const resultado = await this.cupoService.validarPorRfid(rfid_tag, volumen);
            return res.json(resultado);
        } catch (err) {
            console.error("Error al validar cupo por RFID:", err);
            return res.status(500).json({ error: "Error interno al validar el cupo." });
        }
    };

    // POST /cupos/vehiculo/:placa/validar-despacho
    // Pensado para ser invocado desde el surtidor en el momento de la venta.
    validarDespacho = async (req, res) => {
        const { placa } = req.params;
        const { volumen_solicitado } = req.body;

        if (!volumen_solicitado || volumen_solicitado <= 0) {
            return res.status(400).json({ error: "El campo volumen_solicitado debe ser mayor a 0." });
        }

        try {
            const resultado = await this.cupoService.validarYConsumirCupo(placa, volumen_solicitado);

            if (!resultado.autorizado) {
                return res.status(403).json({
                    autorizado: false,
                    error: resultado.mensaje || "Despacho denegado: cupo insuficiente o vencido.",
                });
            }

            return res.json({
                autorizado: true,
                mensaje: resultado.mensaje,
                id_cupo: resultado.id_cupo,
            });
        } catch (err) {
            console.error("Error al validar despacho:", err);
            return res.status(500).json({ error: "Error interno al validar el cupo." });
        }
    };
}

export default CuposController;