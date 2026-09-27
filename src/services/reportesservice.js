import { connect } from "../database.js";

/**
 * ReportesService
 * ------------------------------------------------------------------
 * Endpoints de SOLO LECTURA, pensados para alimentar dashboards. Cada
 * método hace una única query agregada (o unas pocas en paralelo con
 * Promise.all) en vez de traer filas crudas y sumar en JavaScript:
 * agregaciones como SUM/COUNT siempre deben resolverse en la base de
 * datos, que está optimizada para eso, no en Node.
 * ------------------------------------------------------------------
 */
class ReportesService {
    /**
     * Estadísticas consolidadas de un día (por defecto, hoy). Pensado
     * para las tarjetas de resumen en la parte superior del dashboard.
     */
    async estadisticasGenerales(fecha) {
        const connection = await connect();
        const fechaFiltro = fecha ?? null; // null -> se usa CURDATE() en la query

        const [
            [[volumenDespachado]],
            [[alertasCriticas]],
            [[cisternasEnRuta]],
            [[despachosDelDia]],
            [[vehiculosBloqueados]],
        ] = await Promise.all([
            connection.query(
                `SELECT COALESCE(SUM(volumen_despachado), 0) AS total_litros
                   FROM despachos
                  WHERE estado_transaccion = 'AUTORIZADO'
                    AND DATE(fecha_hora) = COALESCE(?, CURDATE())`,
                [fechaFiltro]
            ),
            connection.query(
                `SELECT COUNT(*) AS total
                   FROM alertas
                  WHERE severidad = 'CRITICA'
                    AND estado IN ('ABIERTA', 'EN_REVISION')`
            ),
            connection.query(
                `SELECT COUNT(DISTINCT id_cisterna) AS total
                   FROM vw_estado_actual_cisternas
                  WHERE evento = 'EN_RUTA'`
            ),
            connection.query(
                `SELECT
                    COUNT(*) AS total_transacciones,
                    SUM(estado_transaccion = 'AUTORIZADO') AS autorizados,
                    SUM(estado_transaccion = 'DENEGADO') AS denegados
                   FROM despachos
                  WHERE DATE(fecha_hora) = COALESCE(?, CURDATE())`,
                [fechaFiltro]
            ),
            connection.query(
                `SELECT COUNT(*) AS total FROM vehiculos WHERE estado = 'BLOQUEADO'`
            ),
        ]);

        return {
            fecha: fechaFiltro ?? new Date().toISOString().slice(0, 10),
            volumen_despachado_litros: Number(volumenDespachado.total_litros),
            alertas_criticas_abiertas: Number(alertasCriticas.total),
            cisternas_en_ruta: Number(cisternasEnRuta.total),
            despachos: {
                total: Number(despachosDelDia.total_transacciones),
                autorizados: Number(despachosDelDia.autorizados ?? 0),
                denegados: Number(despachosDelDia.denegados ?? 0),
            },
            vehiculos_bloqueados: Number(vehiculosBloqueados.total),
        };
    }

    /**
     * Cruce volumétrico: compara, por guía/documento de referencia, el
     * volumen que SALIÓ de un centro de acopio contra el volumen que
     * efectivamente LLEGÓ registrado en la estación de servicio.
     *
     * Se apoya en `documento_referencia` de la tabla `inventario` como
     * llave para emparejar el movimiento de SALIDA con el de ENTRADA
     * del mismo traslado (ambos deberían compartir la misma guía).
     * `HAVING volumen_salida > 0` descarta entradas sueltas que no
     * tienen una salida asociada registrada (datos incompletos, no
     * mermas reales que valga la pena reportar).
     */
    async cruceVolumetrico({ fecha_inicio, fecha_fin } = {}) {
        const connection = await connect();

        const condicionesFecha = [];
        const parametros = [];

        if (fecha_inicio) {
            condicionesFecha.push("i.fecha_hora >= ?");
            parametros.push(fecha_inicio);
        }
        if (fecha_fin) {
            condicionesFecha.push("i.fecha_hora <= ?");
            parametros.push(`${fecha_fin} 23:59:59`);
        }

        const whereFecha = condicionesFecha.length ? `WHERE ${condicionesFecha.join(" AND ")}` : "";

        const [filas] = await connection.query(
            `SELECT
                i.documento_referencia,
                i.id_cisterna,
                c.placa AS placa_cisterna,
                i.tipo_combustible,
                SUM(CASE WHEN i.tipo_movimiento = 'SALIDA' THEN i.volumen ELSE 0 END) AS volumen_salida,
                SUM(CASE WHEN i.tipo_movimiento = 'ENTRADA' THEN i.volumen ELSE 0 END) AS volumen_llegada,
                (SUM(CASE WHEN i.tipo_movimiento = 'SALIDA' THEN i.volumen ELSE 0 END) -
                 SUM(CASE WHEN i.tipo_movimiento = 'ENTRADA' THEN i.volumen ELSE 0 END)) AS diferencia_litros
               FROM inventario i
               LEFT JOIN cisternas c ON c.id_cisterna = i.id_cisterna
               ${whereFecha}
              GROUP BY i.documento_referencia, i.id_cisterna, c.placa, i.tipo_combustible
             HAVING volumen_salida > 0
              ORDER BY diferencia_litros DESC`,
            parametros
        );

        // El porcentaje de merma se calcula aquí (no en SQL) porque es
        // una división simple sobre datos ya agregados por la query;
        // hacerlo en SQL habría significado repetir la misma expresión
        // SUM(...) tres veces en el SELECT sin ganar nada en rendimiento.
        const resultado = filas.map((fila) => ({
            ...fila,
            volumen_salida: Number(fila.volumen_salida),
            volumen_llegada: Number(fila.volumen_llegada),
            diferencia_litros: Number(fila.diferencia_litros),
            porcentaje_merma:
                fila.volumen_salida > 0
                    ? Number(((fila.diferencia_litros / fila.volumen_salida) * 100).toFixed(2))
                    : 0,
        }));

        return resultado;
    }
}

export default ReportesService;