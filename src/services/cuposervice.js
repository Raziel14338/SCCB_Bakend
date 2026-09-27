import { connect } from "../database.js";

/**
 * CupoService
 * ------------------------------------------------------------------
 * Encapsula las consultas SQL relacionadas con la tabla `cupos`.
 * La operación más sensible de este módulo — validar y descontar el
 * cupo en el momento del despacho — se delega a un STORED PROCEDURE
 * (`sp_validar_y_consumir_cupo`, incluido en sp_validar_cupo.sql) en
 * lugar de resolverse con un SELECT + UPDATE desde Node.
 *
 * Motivo: dos surtidores podrían consultar el mismo cupo casi al mismo
 * tiempo. Si la validación y el descuento se hicieran en dos pasos
 * separados desde la aplicación, existiría una condición de carrera
 * (ambos leen "quedan 20 litros" y ambos autorizan 15 litros cada uno,
 * dejando el cupo en negativo). El procedimiento resuelve esto con una
 * transacción + `SELECT ... FOR UPDATE`, que bloquea la fila del cupo
 * hasta que la primera transacción termina.
 *
 * `validarPorRfid` es la única excepción a "todo pasa por el SP": es
 * un chequeo de SOLO LECTURA (sin transacción, sin bloqueo) pensado
 * para que el surtidor pinte un semáforo en pantalla antes de que el
 * operador cargue el volumen exacto. Como no descuenta nada, no hay
 * condición de carrera que resolver aquí — la autorización real y
 * definitiva sigue siendo `validarYConsumirCupo`.
 * ------------------------------------------------------------------
 */
class CupoService {
    async crear({ placa, volumen_autorizado, periodo, fecha_inicio, fecha_fin }) {
        const connection = await connect();

        const [[vehiculo]] = await connection.query(
            "SELECT id_vehiculo FROM vehiculos WHERE placa = ? LIMIT 1",
            [placa]
        );
        if (!vehiculo) {
            const error = new Error(`No existe un vehículo registrado con placa "${placa}".`);
            error.status = 404;
            throw error;
        }

        const [resultado] = await connection.query(
            `INSERT INTO cupos
                (id_vehiculo, volumen_autorizado, periodo, fecha_inicio, fecha_fin)
             VALUES (?, ?, ?, ?, ?)`,
            [vehiculo.id_vehiculo, volumen_autorizado, periodo ?? "MENSUAL", fecha_inicio, fecha_fin]
        );

        return this.obtenerPorId(resultado.insertId);
    }

    async obtenerPorId(id_cupo) {
        const connection = await connect();
        const [[cupo]] = await connection.query(
            "SELECT * FROM cupos WHERE id_cupo = ? LIMIT 1",
            [id_cupo]
        );
        return cupo ?? null;
    }

    /** Historial completo de cupos (vigentes, agotados, vencidos) de un vehículo. */
    async listarPorPlaca(placa) {
        const connection = await connect();

        const [filas] = await connection.query(
            `SELECT cu.*
             FROM cupos cu
             INNER JOIN vehiculos v ON v.id_vehiculo = cu.id_vehiculo
             WHERE v.placa = ?
             ORDER BY cu.fecha_inicio DESC`,
            [placa]
        );

        return filas;
    }

    /** Cupo actualmente vigente (dentro del periodo) para un vehículo, si existe. */
    async obtenerCupoVigente(placa) {
        const connection = await connect();

        const [[cupo]] = await connection.query(
            `SELECT cu.*
             FROM cupos cu
             INNER JOIN vehiculos v ON v.id_vehiculo = cu.id_vehiculo
             WHERE v.placa = ?
               AND cu.estado = 'VIGENTE'
               AND CURDATE() BETWEEN cu.fecha_inicio AND cu.fecha_fin
             ORDER BY cu.fecha_inicio DESC
             LIMIT 1`,
            [placa]
        );

        return cupo ?? null;
    }

    /**
     * Chequeo rápido de SOLO LECTURA a partir del RFID leído por el
     * surtidor. No descuenta volumen ni toca la tabla: solo informa si,
     * en principio, el vehículo tiene margen para despachar. Útil para
     * feedback inmediato en pantalla antes de llamar a
     * `validarYConsumirCupo`, que es quien autoriza y descuenta de verdad.
     */
    async validarPorRfid(rfid_tag, volumenSolicitado = null) {
        const connection = connect();

        const [[info]] = await connection.query(
            `SELECT v.id_vehiculo, v.placa, v.estado AS vehiculo_estado,
                    cu.id_cupo, cu.volumen_autorizado, cu.volumen_consumido,
                    (cu.volumen_autorizado - cu.volumen_consumido) AS volumen_disponible,
                    cu.estado AS cupo_estado
               FROM vehiculos v
               LEFT JOIN cupos cu
                      ON cu.id_vehiculo = v.id_vehiculo
                     AND cu.estado = 'VIGENTE'
                     AND CURDATE() BETWEEN cu.fecha_inicio AND cu.fecha_fin
              WHERE v.rfid_tag = ?
              LIMIT 1`,
            [rfid_tag]
        );

        if (!info) {
            return { autorizado: false, mensaje: "No existe un vehículo con ese RFID." };
        }

        if (info.vehiculo_estado !== "ACTIVO") {
            return { autorizado: false, mensaje: "El vehículo está bloqueado o inactivo.", ...info };
        }

        if (!info.id_cupo) {
            return {
                autorizado: false,
                mensaje: "El vehículo no tiene un cupo vigente para el periodo actual.",
                ...info,
            };
        }

        const disponible = Number(info.volumen_disponible);

        if (volumenSolicitado !== null && volumenSolicitado > disponible) {
            return {
                autorizado: false,
                mensaje: `Volumen solicitado excede el disponible (${disponible} litros).`,
                ...info,
            };
        }

        return {
            autorizado: disponible > 0,
            mensaje: disponible > 0 ? "Cupo con saldo disponible." : "Cupo agotado.",
            ...info,
        };
    }

    /**
     * Valida si el vehículo puede despachar `volumenSolicitado` litros y,
     * de ser así, descuenta el volumen de forma atómica vía Stored
     * Procedure. Este es el método que debería llamar el surtidor justo
     * antes de autorizar la venta.
     */
    async validarYConsumirCupo(placa, volumenSolicitado) {
        const connection = await connect();

        await connection.query("SET @p_autorizado = 0, @p_mensaje = '', @p_id_cupo = 0;");

        await connection.query(
            "CALL sp_validar_y_consumir_cupo(?, ?, @p_autorizado, @p_mensaje, @p_id_cupo)",
            [placa, volumenSolicitado]
        );

        const [[salida]] = await connection.query(
            "SELECT @p_autorizado AS autorizado, @p_mensaje AS mensaje, @p_id_cupo AS id_cupo"
        );

        return {
            autorizado: Boolean(salida.autorizado),
            mensaje: salida.mensaje,
            id_cupo: salida.id_cupo || null,
        };
    }
}

export default CupoService;