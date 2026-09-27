import { connect } from "../database.js";

/**
 * CisternaService
 * ------------------------------------------------------------------
 * Encapsula TODAS las consultas SQL relacionadas con las tablas
 * `cisternas` y `registro_telemetria`. El controlador nunca debe
 * hablar directamente con `connect()`; siempre pasa por esta clase.
 *
 * Ventajas de separarlo del controlador (patrón MVC + Services):
 *  - El controlador queda enfocado solo en el protocolo HTTP (status
 *    codes, req/res), y este Service en las reglas de negocio/SQL.
 *  - Se puede reutilizar la misma lógica desde otro lugar (por ejemplo,
 *    un job/cron que reciba telemetría por MQTT en vez de HTTP) sin
 *    duplicar código ni depender de Express.
 *  - Es mucho más fácil de testear con un mock de `connect()`.
 * ------------------------------------------------------------------
 */
class CisternaService {
    /**
     * Registra una nueva cisterna. Verifica primero que la placa no
     * exista para devolver un 409 controlado en vez de un error crudo
     * de restricción UNIQUE.
     */
    async crear({ placa, rfid_tag, empresa_transporte, capacidad_total, sensor_iot_id }) {
        const connection = await connect();

        const [existentes] = await connection.query(
            "SELECT id_cisterna FROM cisternas WHERE placa = ? LIMIT 1",
            [placa]
        );
        if (existentes.length > 0) {
            const error = new Error("Ya existe una cisterna registrada con esa placa.");
            error.status = 409;
            throw error;
        }

        const [resultado] = await connection.query(
            `INSERT INTO cisternas
                (placa, rfid_tag, empresa_transporte, capacidad_total, sensor_iot_id)
             VALUES (?, ?, ?, ?, ?)`,
            [placa, rfid_tag ?? null, empresa_transporte, capacidad_total, sensor_iot_id ?? null]
        );

        return this.obtenerPorId(resultado.insertId);
    }

    async obtenerPorId(id_cisterna) {
        const connection = await connect();
        const [[cisterna]] = await connection.query(
            "SELECT * FROM cisternas WHERE id_cisterna = ? LIMIT 1",
            [id_cisterna]
        );
        return cisterna ?? null;
    }

    async obtenerPorPlaca(placa) {
        const connection = await connect();
        const [[cisterna]] = await connection.query(
            "SELECT * FROM cisternas WHERE placa = ? LIMIT 1",
            [placa]
        );
        return cisterna ?? null;
    }

    /**
     * Lista cisternas, opcionalmente filtradas por estado
     * (OPERATIVA | MANTENIMIENTO | FUERA_DE_SERVICIO).
     */
    async listar({ estado } = {}) {
        const connection = await connect();

        if (estado) {
            const [filas] = await connection.query(
                "SELECT * FROM cisternas WHERE estado = ? ORDER BY id_cisterna DESC",
                [estado]
            );
            return filas;
        }

        const [filas] = await connection.query(
            "SELECT * FROM cisternas ORDER BY id_cisterna DESC"
        );
        return filas;
    }

    async actualizarEstado(placa, nuevoEstado) {
        const connection = await connect();

        const [resultado] = await connection.query(
            "UPDATE cisternas SET estado = ? WHERE placa = ?",
            [nuevoEstado, placa]
        );

        if (resultado.affectedRows === 0) {
            const error = new Error("No se encontró una cisterna con esa placa.");
            error.status = 404;
            throw error;
        }

        return this.obtenerPorPlaca(placa);
    }

    async obtenerUltimaTelemetria(placa) {
        const connection = await connect();

        const [[cisterna]] = await connection.query(
            "SELECT id_cisterna FROM cisternas WHERE placa = ? LIMIT 1",
            [placa]
        );
        if (!cisterna) {
            const error = new Error("No se encontró una cisterna con esa placa.");
            error.status = 404;
            throw error;
        }

        const [[telemetria]] = await connection.query(
            `SELECT * FROM registro_telemetria
             WHERE id_cisterna = ?
             ORDER BY fecha_hora DESC
             LIMIT 1`,
            [cisterna.id_cisterna]
        );

        return telemetria ?? null;
    }

    /**
     * Guarda un nuevo punto de telemetría IoT (nivel, flujo, posición)
     * para la cisterna indicada. Pensado para ser llamado desde el
     * gateway/edge del sensor a través del endpoint POST correspondiente.
     */
    async registrarTelemetria(placa, datos) {
        const connection = await connect();

        const [[cisterna]] = await connection.query(
            "SELECT id_cisterna FROM cisternas WHERE placa = ? LIMIT 1",
            [placa]
        );
        if (!cisterna) {
            const error = new Error("No se encontró una cisterna con esa placa.");
            error.status = 404;
            throw error;
        }

        const { latitud, longitud, nivel_carga, flujo_instantaneo, velocidad_kmh, evento } = datos;

        await connection.query(
            `INSERT INTO registro_telemetria
                (id_cisterna, latitud, longitud, nivel_carga, flujo_instantaneo, velocidad_kmh, evento)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                cisterna.id_cisterna,
                latitud,
                longitud,
                nivel_carga,
                flujo_instantaneo ?? null,
                velocidad_kmh ?? null,
                evento ?? "EN_RUTA",
            ]
        );

        return this.obtenerUltimaTelemetria(placa);
    }
}

export default CisternaService;