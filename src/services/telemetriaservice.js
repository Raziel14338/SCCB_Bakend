import { connect } from "../database.js";

/**
 * TelemetriaService
 * ------------------------------------------------------------------
 * Este servicio es el punto de entrada de TODO el flujo de datos que
 * viene del hardware (ESP32 / Arduino simulado en Proteus). A
 * diferencia de otros módulos donde el volumen de escritura es bajo
 * (un usuario, un vehículo), aquí se espera un INSERT cada pocos
 * segundos por cada cisterna en ruta, así que el diseño prioriza dos
 * cosas:
 *
 *   1. INSERT mínimo y directo: nada de SELECT previos innecesarios
 *      antes de guardar. Solo se valida que la cisterna exista
 *      (1 query liviana con índice por PK) para no ensuciar la tabla
 *      con id_cisterna inventados por un dispositivo mal configurado.
 *
 *   2. Lectura del "último estado" delegada a la vista
 *      `vw_estado_actual_cisternas`, que ya viene en tu base de datos
 *      y resuelve el `MAX(id_telemetria) GROUP BY id_cisterna` de
 *      forma centralizada. Así evitamos reescribir esa subconsulta
 *      aquí y nos aseguramos de que el dashboard y esta API siempre
 *      vean exactamente el mismo "último punto conocido".
 * ------------------------------------------------------------------
 */
class TelemetriaService {
    // POST /api/telemetria/registro  (llamado por el ESP32 o el puente serial)
    async registrar({
        id_cisterna,
        latitud,
        longitud,
        nivel_carga,
        flujo_instantaneo,
        velocidad_kmh,
        evento,
    }) {
        const db = connect();

        const [cisterna] = await db.query(
            "SELECT id_cisterna, estado FROM cisternas WHERE id_cisterna = ? LIMIT 1",
            [id_cisterna]
        );

        if (cisterna.length === 0) {
            const err = new Error(`No existe una cisterna registrada con id ${id_cisterna}.`);
            err.status = 404;
            throw err;
        }

        const [resultado] = await db.query(
            `INSERT INTO registro_telemetria
                (id_cisterna, latitud, longitud, nivel_carga, flujo_instantaneo, velocidad_kmh, evento)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                id_cisterna,
                latitud,
                longitud,
                nivel_carga,
                flujo_instantaneo ?? null,
                velocidad_kmh ?? null,
                evento ?? "EN_RUTA",
            ]
        );

        // No hacemos un SELECT de vuelta completo (sería otro round-trip
        // innecesario en un endpoint de alta frecuencia): devolvemos solo
        // lo que el cliente (ESP32) necesita para confirmar que llegó bien.
        return {
            id_telemetria: resultado.insertId,
            id_cisterna,
            recibido_en: new Date().toISOString(),
        };
    }

    // GET /api/telemetria/cisterna/:id_cisterna  (último punto conocido)
    async obtenerUltimoPorCisterna(id_cisterna) {
        const db = connect();

        const [filas] = await db.query(
            `SELECT id_cisterna, placa, fecha_hora, latitud, longitud,
                    nivel_carga, flujo_instantaneo, evento
               FROM vw_estado_actual_cisternas
              WHERE id_cisterna = ?
              LIMIT 1`,
            [id_cisterna]
        );

        return filas[0] ?? null;
    }

    // GET /api/telemetria/cisterna/:id_cisterna/historial?limite=50
    // Útil para graficar la ruta reciente en un mapa, no solo el último punto.
    async obtenerHistorial(id_cisterna, limite = 50) {
        const db = connect();

        const [filas] = await db.query(
            `SELECT id_telemetria, fecha_hora, latitud, longitud,
                    nivel_carga, flujo_instantaneo, velocidad_kmh, evento
               FROM registro_telemetria
              WHERE id_cisterna = ?
              ORDER BY fecha_hora DESC
              LIMIT ?`,
            [id_cisterna, Number(limite)]
        );

        return filas;
    }
}

export default TelemetriaService;