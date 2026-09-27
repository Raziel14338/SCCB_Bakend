import { connect } from "../database.js";

/**
 * AlertasService
 * ------------------------------------------------------------------
 * Encapsula TODAS las consultas SQL de la tabla `alertas`.
 *
 * Nota sobre los estados: tu tabla `alertas` ya trae un ENUM definido
 * como ('ABIERTA','EN_REVISION','RESUELTA','DESCARTADA'). Este service
 * usa esos 4 valores (no 'PENDIENTE'/'REVISADA' como se mencionó en el
 * requerimiento) para no reñir con la restricción ENUM de la columna:
 * insertar un valor fuera del ENUM haría fallar el INSERT en modo
 * estricto de MySQL/MariaDB, o lo truncaría a '' en modo no estricto
 * (que es justamente el bug que se ve en algunas filas de tu propia
 * tabla `registro_telemetria`, con `evento` vacío por un valor fuera
 * del ENUM). 'ABIERTA' ~ 'PENDIENTE' y 'EN_REVISION' ~ 'REVISADA' son
 * equivalentes conceptuales.
 * ------------------------------------------------------------------
 */
class AlertasService {
    /**
     * Registra una nueva alerta. Pensado para ser invocado tanto por un
     * operador humano (vía API) como por otro Service del sistema de
     * forma interna (ej. TelemetriaService podría llamar a este método
     * al detectar una caída brusca de volumen, sin pasar por HTTP).
     */
    async registrar({ tipo_alerta, descripcion, severidad, id_cisterna, id_vehiculo, id_estacion }) {
        const connection = await connect();

        const [resultado] = await connection.query(
            `INSERT INTO alertas
                (tipo_alerta, descripcion, severidad, id_cisterna, id_vehiculo, id_estacion, estado)
             VALUES (?, ?, ?, ?, ?, ?, 'ABIERTA')`,
            [
                tipo_alerta,
                descripcion,
                severidad ?? "MEDIA",
                id_cisterna ?? null,
                id_vehiculo ?? null,
                id_estacion ?? null,
            ]
        );

        return this.obtenerPorId(resultado.insertId);
    }

    async obtenerPorId(id_alerta) {
        const connection = await connect();
        const [[alerta]] = await connection.query(
            `SELECT a.*, c.placa AS placa_cisterna, v.placa AS placa_vehiculo, es.nombre AS estacion
               FROM alertas a
               LEFT JOIN cisternas c ON c.id_cisterna = a.id_cisterna
               LEFT JOIN vehiculos v ON v.id_vehiculo = a.id_vehiculo
               LEFT JOIN estaciones_servicio es ON es.id_estacion = a.id_estacion
              WHERE a.id_alerta = ?
              LIMIT 1`,
            [id_alerta]
        );
        return alerta ?? null;
    }

    /**
     * Lista alertas con filtros opcionales por estado y severidad.
     * Sin filtros, devuelve TODO el histórico (no solo las activas);
     * para "solo lo que necesita atención ahora" usa el filtro
     * estado=ABIERTA,EN_REVISION desde el controlador, o directamente
     * la vista `vw_alertas_activas` si prefieres ese atajo.
     */
    async listar({ estado, severidad } = {}) {
        const connection = await connect();

        const condiciones = [];
        const parametros = [];

        if (estado) {
            // Acepta un solo estado o varios separados por coma
            // (ej. ?estado=ABIERTA,EN_REVISION) para cubrir el caso común
            // de "todo lo que sigue pendiente de revisión".
            const estados = estado.split(",").map((e) => e.trim());
            condiciones.push(`a.estado IN (${estados.map(() => "?").join(",")})`);
            parametros.push(...estados);
        }

        if (severidad) {
            const severidades = severidad.split(",").map((s) => s.trim());
            condiciones.push(`a.severidad IN (${severidades.map(() => "?").join(",")})`);
            parametros.push(...severidades);
        }

        const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

        const [filas] = await connection.query(
            `SELECT a.id_alerta, a.tipo_alerta, a.descripcion, a.severidad, a.estado,
                    a.fecha_hora, a.fecha_resolucion,
                    c.placa AS placa_cisterna, v.placa AS placa_vehiculo, es.nombre AS estacion,
                    u.nombre_completo AS resuelto_por
               FROM alertas a
               LEFT JOIN cisternas c ON c.id_cisterna = a.id_cisterna
               LEFT JOIN vehiculos v ON v.id_vehiculo = a.id_vehiculo
               LEFT JOIN estaciones_servicio es ON es.id_estacion = a.id_estacion
               LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario_resolucion
               ${where}
              ORDER BY FIELD(a.severidad, 'CRITICA', 'ALTA', 'MEDIA', 'BAJA') ASC,
                       a.fecha_hora DESC`,
            parametros
        );

        return filas;
    }

    /**
     * Cambia el estado de una alerta (ej. cuando un fiscal de la ANH la
     * revisa y la marca como RESUELTA o DESCARTADA). Registra quién y
     * cuándo, pero SOLO sella fecha_resolucion cuando el nuevo estado es
     * uno de cierre (RESUELTA/DESCARTADA); pasar a EN_REVISION no cierra
     * el caso, así que no debe tocar esa columna.
     */
    async actualizarEstado(id_alerta, { estado, id_usuario_resolucion }) {
        const connection = await connect();

        const alertaActual = await this.obtenerPorId(id_alerta);
        if (!alertaActual) {
            const error = new Error(`No se encontró una alerta con id ${id_alerta}.`);
            error.status = 404;
            throw error;
        }

        const esCierre = estado === "RESUELTA" || estado === "DESCARTADA";

        await connection.query(
            `UPDATE alertas
                SET estado = ?,
                    id_usuario_resolucion = ?,
                    fecha_resolucion = ${esCierre ? "NOW()" : "fecha_resolucion"}
              WHERE id_alerta = ?`,
            [estado, id_usuario_resolucion ?? null, id_alerta]
        );

        return this.obtenerPorId(id_alerta);
    }
}

export default AlertasService;