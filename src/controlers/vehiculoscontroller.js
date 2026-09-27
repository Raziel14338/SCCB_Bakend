import VehiculoService from "../services/vehiculoservice.js";

class VehiculosController {
    constructor() {
        this.vehiculoService = new VehiculoService();
    }

    // POST /vehiculos
    registrarVehiculo = async (req, res) => {
        const { placa, rfid_tag, tipo_vehiculo, capacidad_tanque, id_conductor } = req.body;

        if (!placa || !rfid_tag || !capacidad_tanque || !id_conductor) {
            return res.status(400).json({
                error: "Los campos placa, rfid_tag, capacidad_tanque e id_conductor son requeridos.",
            });
        }

        try {
            const vehiculo = await this.vehiculoService.crear({
                placa,
                rfid_tag,
                tipo_vehiculo,
                capacidad_tanque,
                id_conductor,
            });

            return res.status(201).json({
                mensaje: "Vehículo registrado exitosamente.",
                vehiculo,
            });
        } catch (err) {
            console.error("Error al registrar vehículo:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al registrar el vehículo.",
            });
        }
    };

    // GET /vehiculos/placa/:placa  (usado por el módulo OCR)
    obtenerVehiculoPorPlaca = async (req, res) => {
        const { placa } = req.params;

        try {
            const vehiculo = await this.vehiculoService.obtenerPorPlaca(placa);

            if (!vehiculo) {
                return res.status(404).json({
                    error: `No se encontró un vehículo con placa "${placa}".`,
                });
            }

            return res.json({ vehiculo });
        } catch (err) {
            console.error("Error al consultar vehículo por placa:", err);
            return res.status(500).json({ error: "Error interno al consultar el vehículo." });
        }
    };

    // GET /vehiculos/rfid/:rfid_tag  (usado por el surtidor RFID)
    obtenerVehiculoPorRfid = async (req, res) => {
        const { rfid_tag } = req.params;

        try {
            const vehiculo = await this.vehiculoService.obtenerPorRfid(rfid_tag);

            if (!vehiculo) {
                return res.status(404).json({
                    error: `No se encontró un vehículo con el RFID "${rfid_tag}".`,
                });
            }

            return res.json({ vehiculo });
        } catch (err) {
            console.error("Error al consultar vehículo por RFID:", err);
            return res.status(500).json({ error: "Error interno al consultar el vehículo." });
        }
    };

    // GET /obtener/vehiculos?estado=ACTIVO&id_conductor=3
    listarVehiculos = async (req, res) => {
        const { estado, id_conductor } = req.query;

        try {
            const vehiculos = await this.vehiculoService.listar({ estado, id_conductor });
            return res.json({ total: vehiculos.length, vehiculos });
        } catch (err) {
            console.error("Error al listar vehículos:", err);
            return res.status(500).json({ error: "Error interno al listar los vehículos." });
        }
    };

    // PATCH /vehiculos/:placa/estado
    actualizarEstadoVehiculo = async (req, res) => {
        const { placa } = req.params;
        const { estado } = req.body;

        const estadosValidos = ["ACTIVO", "BLOQUEADO", "INACTIVO"];
        if (!estado || !estadosValidos.includes(estado)) {
            return res.status(400).json({
                error: `El campo estado es requerido y debe ser uno de: ${estadosValidos.join(", ")}.`,
            });
        }

        try {
            const vehiculo = await this.vehiculoService.actualizarEstado(placa, estado);
            return res.json({ mensaje: "Estado actualizado correctamente.", vehiculo });
        } catch (err) {
            console.error("Error al actualizar estado de vehículo:", err);
            return res.status(err.status ?? 500).json({
                error: err.status ? err.message : "Error interno al actualizar el vehículo.",
            });
        }
    };
}

export default VehiculosController;