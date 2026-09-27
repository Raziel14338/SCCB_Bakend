import { connect } from "../database.js";

/**
 * InfraestructuraService
 * ------------------------------------------------------------------
 * Encapsula TODAS las consultas SQL de los activos físicos fijos del
 * sistema: centros_acopio, estaciones_servicio y surtidores. No toca
 * inventario ni despachos — eso vive en InventarioService, que además
 * consulta estas mismas tablas (surtidores, estaciones) solo para
 * validar existencia antes de escribir un movimiento.
 * ------------------------------------------------------------------
 */
class InfraestructuraService {
    // ================== CENTROS DE ACOPIO ==================

    async crearCentroAcopio({ nombre, ubicacion, latitud, longitud, capacidad_almacen }) {
        const connection = await connect();

        const [resultado] = await connection.query(
            `INSERT INTO centros_acopio (nombre, ubicacion, latitud, longitud, capacidad_almacen)
             VALUES (?, ?, ?, ?, ?)`,
            [nombre, ubicacion, latitud ?? null, longitud ?? null, capacidad_almacen]
        );

        return this.obtenerCentroAcopioPorId(resultado.insertId);
    }

    async obtenerCentroAcopioPorId(id_centro) {
        const connection = await connect();
        const [[centro]] = await connection.query(
            "SELECT * FROM centros_acopio WHERE id_centro = ? LIMIT 1",
            [id_centro]
        );
        return centro ?? null;
    }

    async listarCentrosAcopio({ estado } = {}) {
        const connection = await connect();

        if (estado) {
            const [filas] = await connection.query(
                "SELECT * FROM centros_acopio WHERE estado = ? ORDER BY id_centro DESC",
                [estado]
            );
            return filas;
        }

        const [filas] = await connection.query("SELECT * FROM centros_acopio ORDER BY id_centro DESC");
        return filas;
    }

    /** Update parcial: solo pisa los campos que vienen en `datos`. */
    async actualizarCentroAcopio(id_centro, datos) {
        const connection = await connect();

        const existente = await this.obtenerCentroAcopioPorId(id_centro);
        if (!existente) {
            const error = new Error("No se encontró un centro de acopio con ese ID.");
            error.status = 404;
            throw error;
        }

        const campos = {
            nombre: datos.nombre ?? existente.nombre,
            ubicacion: datos.ubicacion ?? existente.ubicacion,
            latitud: datos.latitud ?? existente.latitud,
            longitud: datos.longitud ?? existente.longitud,
            capacidad_almacen: datos.capacidad_almacen ?? existente.capacidad_almacen,
            estado: datos.estado ?? existente.estado,
        };

        await connection.query(
            `UPDATE centros_acopio
                SET nombre = ?, ubicacion = ?, latitud = ?, longitud = ?,
                    capacidad_almacen = ?, estado = ?
              WHERE id_centro = ?`,
            [
                campos.nombre, campos.ubicacion, campos.latitud, campos.longitud,
                campos.capacidad_almacen, campos.estado, id_centro,
            ]
        );

        return this.obtenerCentroAcopioPorId(id_centro);
    }

    async eliminarCentroAcopio(id_centro) {
        const connection = await connect();

        const [resultado] = await connection.query(
            "DELETE FROM centros_acopio WHERE id_centro = ?",
            [id_centro]
        );

        if (resultado.affectedRows === 0) {
            const error = new Error("No se encontró un centro de acopio con ese ID.");
            error.status = 404;
            throw error;
        }

        return { eliminado: true, id_centro: Number(id_centro) };
    }

    // ================== ESTACIONES DE SERVICIO ==================

    async crearEstacion({ nombre, codigo_ypfb, ubicacion, latitud, longitud }) {
        const connection = await connect();

        const [existentes] = await connection.query(
            "SELECT id_estacion FROM estaciones_servicio WHERE codigo_ypfb = ? LIMIT 1",
            [codigo_ypfb]
        );
        if (existentes.length > 0) {
            const error = new Error("Ya existe una estación registrada con ese código YPFB.");
            error.status = 409;
            throw error;
        }

        const [resultado] = await connection.query(
            `INSERT INTO estaciones_servicio (nombre, codigo_ypfb, ubicacion, latitud, longitud)
             VALUES (?, ?, ?, ?, ?)`,
            [nombre, codigo_ypfb, ubicacion, latitud ?? null, longitud ?? null]
        );

        return this.obtenerEstacionPorId(resultado.insertId);
    }

    async obtenerEstacionPorId(id_estacion) {
        const connection = await connect();
        const [[estacion]] = await connection.query(
            "SELECT * FROM estaciones_servicio WHERE id_estacion = ? LIMIT 1",
            [id_estacion]
        );
        return estacion ?? null;
    }

    async listarEstaciones({ estado } = {}) {
        const connection = await connect();

        if (estado) {
            const [filas] = await connection.query(
                "SELECT * FROM estaciones_servicio WHERE estado = ? ORDER BY id_estacion DESC",
                [estado]
            );
            return filas;
        }

        const [filas] = await connection.query("SELECT * FROM estaciones_servicio ORDER BY id_estacion DESC");
        return filas;
    }

    async actualizarEstacion(id_estacion, datos) {
        const connection = await connect();

        const existente = await this.obtenerEstacionPorId(id_estacion);
        if (!existente) {
            const error = new Error("No se encontró una estación con ese ID.");
            error.status = 404;
            throw error;
        }

        const campos = {
            nombre: datos.nombre ?? existente.nombre,
            ubicacion: datos.ubicacion ?? existente.ubicacion,
            latitud: datos.latitud ?? existente.latitud,
            longitud: datos.longitud ?? existente.longitud,
            estado: datos.estado ?? existente.estado,
        };

        await connection.query(
            `UPDATE estaciones_servicio
                SET nombre = ?, ubicacion = ?, latitud = ?, longitud = ?, estado = ?
              WHERE id_estacion = ?`,
            [campos.nombre, campos.ubicacion, campos.latitud, campos.longitud, campos.estado, id_estacion]
        );

        return this.obtenerEstacionPorId(id_estacion);
    }

    async eliminarEstacion(id_estacion) {
        const connection = await connect();

        // OJO: fk_surtidores_estacion tiene ON DELETE CASCADE, así que
        // eliminar una estación borra en cascada todos sus surtidores.
        const [resultado] = await connection.query(
            "DELETE FROM estaciones_servicio WHERE id_estacion = ?",
            [id_estacion]
        );

        if (resultado.affectedRows === 0) {
            const error = new Error("No se encontró una estación con ese ID.");
            error.status = 404;
            throw error;
        }

        return { eliminado: true, id_estacion: Number(id_estacion) };
    }

    // ================== SURTIDORES ==================

    async crearSurtidor({ id_estacion, numero_surtidor, tipo_combustible, tiene_ocr, tiene_rfid }) {
        const connection = await connect();

        const estacion = await this.obtenerEstacionPorId(id_estacion);
        if (!estacion) {
            const error = new Error("La estación indicada no existe.");
            error.status = 404;
            throw error;
        }

        const [duplicado] = await connection.query(
            "SELECT id_surtidor FROM surtidores WHERE id_estacion = ? AND numero_surtidor = ? LIMIT 1",
            [id_estacion, numero_surtidor]
        );
        if (duplicado.length > 0) {
            const error = new Error(`Ya existe el surtidor "${numero_surtidor}" en esta estación.`);
            error.status = 409;
            throw error;
        }

        const [resultado] = await connection.query(
            `INSERT INTO surtidores (id_estacion, numero_surtidor, tipo_combustible, tiene_ocr, tiene_rfid)
             VALUES (?, ?, ?, ?, ?)`,
            [id_estacion, numero_surtidor, tipo_combustible, tiene_ocr ?? true, tiene_rfid ?? true]
        );

        return this.obtenerSurtidorPorId(resultado.insertId);
    }

    async obtenerSurtidorPorId(id_surtidor) {
        const connection = await connect();
        const [[surtidor]] = await connection.query(
            "SELECT * FROM surtidores WHERE id_surtidor = ? LIMIT 1",
            [id_surtidor]
        );
        return surtidor ?? null;
    }

    async listarSurtidoresPorEstacion(id_estacion) {
        const connection = await connect();
        const [filas] = await connection.query(
            "SELECT * FROM surtidores WHERE id_estacion = ? ORDER BY numero_surtidor",
            [id_estacion]
        );
        return filas;
    }

    async listarTodosSurtidores() {
        const connection = await connect();
        const [filas] = await connection.query(
            `SELECT s.*, es.nombre AS nombre_estacion
               FROM surtidores s
               INNER JOIN estaciones_servicio es ON es.id_estacion = s.id_estacion
              ORDER BY es.nombre, s.numero_surtidor`
        );
        return filas;
    }
}

export default InfraestructuraService;