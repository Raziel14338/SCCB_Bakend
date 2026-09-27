import { connect } from "../database.js";

/**
 * VehiculoService
 * ------------------------------------------------------------------
 * `placa` y `rfid_tag` son UNIQUE en la tabla `vehiculos`, así que
 * las búsquedas por esos campos son directas y muy rápidas (usan el
 * índice único, no un full scan). Son justamente los dos métodos que
 * en producción llamarían el lector OCR de placas y el lector RFID
 * del surtidor en tiempo real.
 * ------------------------------------------------------------------
 */
class VehiculoService {
    // POST /vehiculos
    async crear({ placa, rfid_tag, tipo_vehiculo, capacidad_tanque, id_conductor }) {
        const db = connect();

        const [duplicados] = await db.query(
            "SELECT id_vehiculo FROM vehiculos WHERE placa = ? OR rfid_tag = ? LIMIT 1",
            [placa, rfid_tag]
        );

        if (duplicados.length > 0) {
            const err = new Error("Ya existe un vehículo registrado con esa placa o RFID.");
            err.status = 409;
            throw err;
        }

        const [conductor] = await db.query(
            "SELECT id_conductor FROM conductores WHERE id_conductor = ? LIMIT 1",
            [id_conductor]
        );

        if (conductor.length === 0) {
            const err = new Error(`El conductor con id ${id_conductor} no existe.`);
            err.status = 400;
            throw err;
        }

        const [resultado] = await db.query(
            `INSERT INTO vehiculos
                (placa, rfid_tag, tipo_vehiculo, capacidad_tanque, id_conductor, estado)
             VALUES (?, ?, ?, ?, ?, 'ACTIVO')`,
            [placa, rfid_tag, tipo_vehiculo ?? "LIVIANO", capacidad_tanque, id_conductor]
        );

        return this.obtenerPorId(resultado.insertId);
    }

    async obtenerPorId(id_vehiculo) {
        const db = connect();
        const [filas] = await db.query(
            `SELECT v.id_vehiculo, v.placa, v.rfid_tag, v.tipo_vehiculo, v.capacidad_tanque,
                    v.estado, v.fecha_registro,
                    c.id_conductor, c.nombre_completo AS conductor_nombre, c.estado AS conductor_estado
               FROM vehiculos v
               JOIN conductores c ON c.id_conductor = v.id_conductor
              WHERE v.id_vehiculo = ?
              LIMIT 1`,
            [id_vehiculo]
        );
        return filas[0] ?? null;
    }

    // GET /vehiculos/placa/:placa  (reconocimiento OCR)
    async obtenerPorPlaca(placa) {
        const db = connect();
        const [filas] = await db.query(
            `SELECT v.id_vehiculo, v.placa, v.rfid_tag, v.tipo_vehiculo, v.capacidad_tanque,
                    v.estado, v.fecha_registro,
                    c.id_conductor, c.nombre_completo AS conductor_nombre, c.estado AS conductor_estado
               FROM vehiculos v
               JOIN conductores c ON c.id_conductor = v.id_conductor
              WHERE v.placa = ?
              LIMIT 1`,
            [placa]
        );
        return filas[0] ?? null;
    }

    // GET /vehiculos/rfid/:rfid_tag  (lectura RFID en surtidor)
    async obtenerPorRfid(rfid_tag) {
        const db = connect();
        const [filas] = await db.query(
            `SELECT v.id_vehiculo, v.placa, v.rfid_tag, v.tipo_vehiculo, v.capacidad_tanque,
                    v.estado, v.fecha_registro,
                    c.id_conductor, c.nombre_completo AS conductor_nombre, c.estado AS conductor_estado
               FROM vehiculos v
               JOIN conductores c ON c.id_conductor = v.id_conductor
              WHERE v.rfid_tag = ?
              LIMIT 1`,
            [rfid_tag]
        );
        return filas[0] ?? null;
    }

    // GET /obtener/vehiculos?estado=ACTIVO&id_conductor=3
    async listar({ estado, id_conductor } = {}) {
        const db = connect();

        const condiciones = [];
        const parametros = [];

        if (estado) {
            condiciones.push("v.estado = ?");
            parametros.push(estado);
        }

        if (id_conductor) {
            condiciones.push("v.id_conductor = ?");
            parametros.push(id_conductor);
        }

        const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

        const [filas] = await db.query(
            `SELECT v.id_vehiculo, v.placa, v.rfid_tag, v.tipo_vehiculo, v.capacidad_tanque,
                    v.estado, c.nombre_completo AS conductor_nombre
               FROM vehiculos v
               JOIN conductores c ON c.id_conductor = v.id_conductor
               ${where}
              ORDER BY v.placa ASC`,
            parametros
        );

        return filas;
    }

    // PATCH /vehiculos/:placa/estado
    async actualizarEstado(placa, estado) {
        const db = connect();

        const vehiculo = await this.obtenerPorPlaca(placa);
        if (!vehiculo) {
            const err = new Error(`No se encontró un vehículo con placa "${placa}".`);
            err.status = 404;
            throw err;
        }

        await db.query("UPDATE vehiculos SET estado = ? WHERE placa = ?", [estado, placa]);

        return this.obtenerPorPlaca(placa);
    }
}

export default VehiculoService;