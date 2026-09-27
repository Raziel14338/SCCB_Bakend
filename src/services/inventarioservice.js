import { connect } from "../database.js";
import CuposService from "../services/cuposervice.js";

/**
 * InventarioService
 * ------------------------------------------------------------------
 * Es el núcleo del módulo: mueve combustible de un centro de acopio a
 * una estación (registrarTransferencia) y vende combustible a un
 * vehículo en un surtidor (registrarDespacho).
 *
 * DEPENDENCIA INYECTABLE: recibe una instancia de CuposService en el
 * constructor, con un default (`new CuposService()`) para que en
 * producción no tengas que cablear nada a mano, pero puedas pasar un
 * mock en tests unitarios sin tocar la base de datos:
 *
 *     new InventarioService(new CuposServiceFalso())
 * ------------------------------------------------------------------
 */
class InventarioService {
    constructor(cuposService = new CuposService()) {
        this.cuposService = cuposService;
    }

    // ================== INVENTARIO (TRANSFERENCIAS) ==================

    /**
     * Registra una transferencia de combustible: una SALIDA en el
     * centro de acopio y una ENTRADA en la estación de servicio,
     * como una única operación atómica (misma transacción de BD).
     * Si cualquiera de los dos INSERT falla, se revierte todo — nunca
     * queda una salida registrada sin su entrada correspondiente
     * (que es exactamente el tipo de descuadre que este sistema busca
     * eliminar).
     */
    async registrarTransferencia({
        id_centro_acopio,
        id_estacion,
        id_cisterna,
        tipo_combustible,
        volumen,
        documento_referencia,
        id_usuario_registro,
    }) {
        const connection = await connect();

        const [[centro]] = await connection.query(
            "SELECT id_centro FROM centros_acopio WHERE id_centro = ? LIMIT 1",
            [id_centro_acopio]
        );
        if (!centro) {
            const error = new Error("El centro de acopio indicado no existe.");
            error.status = 404;
            throw error;
        }

        const [[estacion]] = await connection.query(
            "SELECT id_estacion FROM estaciones_servicio WHERE id_estacion = ? LIMIT 1",
            [id_estacion]
        );
        if (!estacion) {
            const error = new Error("La estación de servicio indicada no existe.");
            error.status = 404;
            throw error;
        }

        const documento = documento_referencia ?? `TRANSF-${Date.now()}`;

        try {
            await connection.beginTransaction();

            const [salida] = await connection.query(
                `INSERT INTO inventario
                    (tipo_movimiento, id_centro_acopio, id_estacion, id_cisterna,
                     tipo_combustible, volumen, documento_referencia, id_usuario_registro)
                 VALUES ('SALIDA', ?, NULL, ?, ?, ?, ?, ?)`,
                [id_centro_acopio, id_cisterna ?? null, tipo_combustible, volumen, documento, id_usuario_registro]
            );

            const [entrada] = await connection.query(
                `INSERT INTO inventario
                    (tipo_movimiento, id_centro_acopio, id_estacion, id_cisterna,
                     tipo_combustible, volumen, documento_referencia, id_usuario_registro)
                 VALUES ('ENTRADA', NULL, ?, ?, ?, ?, ?, ?)`,
                [id_estacion, id_cisterna ?? null, tipo_combustible, volumen, documento, id_usuario_registro]
            );

            await connection.commit();

            const [movimientoSalida, movimientoEntrada] = await Promise.all([
                this.obtenerMovimientoPorId(salida.insertId),
                this.obtenerMovimientoPorId(entrada.insertId),
            ]);

            return { documento_referencia: documento, movimiento_salida: movimientoSalida, movimiento_entrada: movimientoEntrada };
        } catch (err) {
            await connection.rollback();
            console.error("Error al registrar transferencia, se revirtió la transacción:", err);
            const error = new Error("No se pudo registrar la transferencia de combustible.");
            error.status = 500;
            throw error;
        }
    }

    async obtenerMovimientoPorId(id_movimiento) {
        const connection = await connect();
        const [[movimiento]] = await connection.query(
            "SELECT * FROM inventario WHERE id_movimiento = ? LIMIT 1",
            [id_movimiento]
        );
        return movimiento ?? null;
    }

    /** Lista movimientos de inventario, con filtros opcionales. */
    async listarInventario({ id_centro_acopio, id_estacion, tipo_movimiento } = {}) {
        const connection = await connect();

        const condiciones = [];
        const params = [];

        if (id_centro_acopio) {
            condiciones.push("id_centro_acopio = ?");
            params.push(id_centro_acopio);
        }
        if (id_estacion) {
            condiciones.push("id_estacion = ?");
            params.push(id_estacion);
        }
        if (tipo_movimiento) {
            condiciones.push("tipo_movimiento = ?");
            params.push(tipo_movimiento);
        }

        const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

        const [filas] = await connection.query(
            `SELECT * FROM inventario ${where} ORDER BY fecha_hora DESC`,
            params
        );

        return filas;
    }

    // ================== DESPACHOS (VENTAS A VEHÍCULOS) ==================

    /**
     * Regla de negocio crítica: registra la venta de combustible a un
     * vehículo en un surtidor, descontando el volumen del Módulo de
     * Cupos (CuposService.descontarSaldo) ANTES de dar por autorizado
     * el despacho.
     *
     * Si el cupo resulta insuficiente (o el vehículo está bloqueado),
     * `descontarSaldo` lanza un Error con `.status`. Ese caso NO se
     * silencia: se deja un registro DENEGADO en `despachos` para
     * trazabilidad/fiscalización (igual que en los datos de ejemplo
     * de la tabla) y luego se re-lanza el error para que el
     * controlador responda con el código HTTP correcto.
     */
    async registrarDespacho({
        id_surtidor,
        rfid_tag_o_placa,
        id_conductor,
        id_usuario_operador,
        volumen_despachado,
        metodo_identificacion,
    }) {
        const connection = await connect();

        const [[vehiculo]] = await connection.query(
            "SELECT id_vehiculo, estado FROM vehiculos WHERE placa = ? OR rfid_tag = ? LIMIT 1",
            [rfid_tag_o_placa, rfid_tag_o_placa]
        );
        if (!vehiculo) {
            const error = new Error(`No se encontró un vehículo con placa/RFID "${rfid_tag_o_placa}".`);
            error.status = 404;
            throw error;
        }

        const [[surtidor]] = await connection.query(
            "SELECT id_surtidor, estado FROM surtidores WHERE id_surtidor = ? LIMIT 1",
            [id_surtidor]
        );
        if (!surtidor) {
            const error = new Error("El surtidor indicado no existe.");
            error.status = 404;
            throw error;
        }
        if (surtidor.estado !== "OPERATIVO") {
            const error = new Error("El surtidor se encuentra fuera de servicio o en mantenimiento.");
            error.status = 409;
            throw error;
        }

        // Se toma el cupo más reciente del vehículo (vigente o no) para
        // poder referenciarlo en despachos.id_cupo (FK NOT NULL) incluso
        // si el despacho termina denegado por cupo agotado/vencido.
        const [[cupoReferencia]] = await connection.query(
            "SELECT id_cupo FROM cupos WHERE id_vehiculo = ? ORDER BY fecha_inicio DESC LIMIT 1",
            [vehiculo.id_vehiculo]
        );
        if (!cupoReferencia) {
            const error = new Error("El vehículo no tiene ningún cupo registrado en el sistema.");
            error.status = 404;
            throw error;
        }

        try {
            await this.cuposService.descontarSaldo(rfid_tag_o_placa, volumen_despachado);
        } catch (errorCupo) {
            await this._insertarDespacho(connection, {
                id_surtidor,
                id_vehiculo: vehiculo.id_vehiculo,
                id_cupo: cupoReferencia.id_cupo,
                id_conductor,
                id_usuario_operador,
                volumen_despachado: 0,
                metodo_identificacion,
                estado_transaccion: "DENEGADO",
            });

            throw errorCupo;
        }

        return this._insertarDespacho(connection, {
            id_surtidor,
            id_vehiculo: vehiculo.id_vehiculo,
            id_cupo: cupoReferencia.id_cupo,
            id_conductor,
            id_usuario_operador,
            volumen_despachado,
            metodo_identificacion,
            estado_transaccion: "AUTORIZADO",
        });
    }

    async _insertarDespacho(connection, {
        id_surtidor,
        id_vehiculo,
        id_cupo,
        id_conductor,
        id_usuario_operador,
        volumen_despachado,
        metodo_identificacion,
        estado_transaccion,
    }) {
        const [resultado] = await connection.query(
            `INSERT INTO despachos
                (id_surtidor, id_vehiculo, id_cupo, id_conductor, id_usuario_operador,
                 volumen_despachado, metodo_identificacion, estado_transaccion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id_surtidor, id_vehiculo, id_cupo, id_conductor, id_usuario_operador,
                volumen_despachado, metodo_identificacion ?? "RFID", estado_transaccion,
            ]
        );

        return this.obtenerDespachoPorId(resultado.insertId);
    }

    async obtenerDespachoPorId(id_despacho) {
        const connection = await connect();
        const [[despacho]] = await connection.query(
            "SELECT * FROM despachos WHERE id_despacho = ? LIMIT 1",
            [id_despacho]
        );
        return despacho ?? null;
    }

    /** Lista despachos, con filtros opcionales (auditoría/fiscalización). */
    async listarDespachos({ id_surtidor, id_vehiculo, estado_transaccion } = {}) {
        const connection = await connect();

        const condiciones = [];
        const params = [];

        if (id_surtidor) {
            condiciones.push("id_surtidor = ?");
            params.push(id_surtidor);
        }
        if (id_vehiculo) {
            condiciones.push("id_vehiculo = ?");
            params.push(id_vehiculo);
        }
        if (estado_transaccion) {
            condiciones.push("estado_transaccion = ?");
            params.push(estado_transaccion);
        }

        const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

        const [filas] = await connection.query(
            `SELECT * FROM despachos ${where} ORDER BY fecha_hora DESC`,
            params
        );

        return filas;
    }
}

export default InventarioService;