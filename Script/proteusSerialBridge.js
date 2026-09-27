import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import axios from "axios";

/**
 * proteusSerialBridge.js
 * ------------------------------------------------------------------
 * Puente entre la simulación de Proteus y el backend real.
 *
 * Cómo encaja en tu PoC:
 *
 *   [Arduino simulado en Proteus] --(COMPIM / puerto COM virtual)-->
 *   [este script Node.js] --(HTTP POST)--> [API Express / registro_telemetria]
 *
 * El componente COMPIM de Proteus expone un puerto COM virtual en tu
 * PC (necesitas un par de puertos virtuales, ej. con com0com en
 * Windows: COM3 <-> COM4, uno lo usa Proteus/COMPIM y el otro este
 * script). El Arduino simulado en el proyecto de Proteus debe hacer
 * `Serial.println(...)` con una línea de texto por lectura; este
 * script solo necesita saber en qué FORMATO llega esa línea.
 *
 * Aquí se asume que el sketch de Arduino imprime una línea JSON, por
 * ejemplo:
 *
 *   Serial.print("{\"id_cisterna\":1,\"latitud\":-16.5,");
 *   Serial.print("\"longitud\":-68.15,\"nivel_carga\":9500,");
 *   Serial.println("\"flujo_instantaneo\":-15.5}");
 *
 * Si tu sketch en cambio imprime CSV plano (más simple de programar
 * en Arduino), tienes la variante comentada más abajo en
 * `parsearLineaCSV`; solo cambia qué función se llama en `onData`.
 *
 * Requisitos:
 *   npm install serialport @serialport/parser-readline axios
 * ------------------------------------------------------------------
 */

// ---- Configuración: ajusta estos 3 valores a tu entorno --------------
const NOMBRE_PUERTO = process.env.SERIAL_PORT || "COM4"; // el extremo del par virtual que NO usa Proteus
const BAUD_RATE = Number(process.env.SERIAL_BAUD_RATE || 9600); // debe coincidir con Serial.begin(...) del sketch
const API_URL = process.env.API_URL || "http://localhost:3700/telemetria/registro";
// -----------------------------------------------------------------------

class ProteusSerialBridge {
    constructor({ puerto = NOMBRE_PUERTO, baudRate = BAUD_RATE, apiUrl = API_URL } = {}) {
        this.puerto = puerto;
        this.baudRate = baudRate;
        this.apiUrl = apiUrl;
        this.serialPort = null;
        this.parser = null;
    }

    iniciar() {
        this.serialPort = new SerialPort(
            { path: this.puerto, baudRate: this.baudRate },
            (err) => {
                if (err) {
                    console.error(`[SerialBridge] No se pudo abrir ${this.puerto}:`, err.message);
                }
            }
        );

        // ReadlineParser corta el stream de bytes en líneas completas,
        // usando el "\n" que deja el Serial.println() del Arduino.
        this.parser = this.serialPort.pipe(new ReadlineParser({ delimiter: "\n" }));

        this.serialPort.on("open", () => {
            console.log(`[SerialBridge] Puerto ${this.puerto} abierto a ${this.baudRate} baudios.`);
        });

        this.serialPort.on("error", (err) => {
            console.error("[SerialBridge] Error de puerto serial:", err.message);
        });

        this.parser.on("data", (linea) => this._onLinea(linea));

        return this;
    }

    async _onLinea(lineaCruda) {
        const linea = lineaCruda.trim();
        if (!linea) return;

        console.log("[SerialBridge] Línea recibida:", linea);

        let payload;
        try {
            payload = this._parsearLineaJSON(linea);
            // Si tu sketch imprime CSV en vez de JSON, usa esta línea en
            // vez de la de arriba:
            // payload = this._parsearLineaCSV(linea);
        } catch (err) {
            console.error("[SerialBridge] Línea con formato inválido, se descarta:", err.message);
            return;
        }

        try {
            const respuesta = await axios.post(this.apiUrl, payload, { timeout: 5000 });
            console.log("[SerialBridge] Enviado a la API OK:", respuesta.data);
        } catch (err) {
            // No tumbamos el bridge si un solo envío falla (ej. backend
            // caído momentáneamente): logueamos y seguimos escuchando el
            // puerto para no perder la conexión serial por un error HTTP.
            const detalle = err.response?.data ?? err.message;
            console.error("[SerialBridge] Error al enviar a la API:", detalle);
        }
    }

    // Formato esperado: una línea JSON completa por lectura.
    _parsearLineaJSON(linea) {
        const datos = JSON.parse(linea);

        if (
            datos.id_cisterna === undefined ||
            datos.latitud === undefined ||
            datos.longitud === undefined ||
            datos.nivel_carga === undefined
        ) {
            throw new Error("Faltan campos obligatorios en el JSON recibido por serial.");
        }

        return datos;
    }

    // Alternativa si tu sketch de Arduino imprime CSV, ej:
    //   Serial.println("1,-16.5,-68.15,9500,-15.5");
    // en el orden: id_cisterna,latitud,longitud,nivel_carga,flujo_instantaneo
    _parsearLineaCSV(linea) {
        const partes = linea.split(",").map((p) => p.trim());

        if (partes.length < 4) {
            throw new Error(`Se esperaban al menos 4 valores separados por coma, llegaron ${partes.length}.`);
        }

        const [id_cisterna, latitud, longitud, nivel_carga, flujo_instantaneo] = partes;

        return {
            id_cisterna: Number(id_cisterna),
            latitud: Number(latitud),
            longitud: Number(longitud),
            nivel_carga: Number(nivel_carga),
            flujo_instantaneo: flujo_instantaneo !== undefined ? Number(flujo_instantaneo) : null,
        };
    }

    detener() {
        if (this.serialPort?.isOpen) {
            this.serialPort.close();
            console.log("[SerialBridge] Puerto cerrado.");
        }
    }
}

// Permite correr el bridge de forma independiente: `node proteusSerialBridge.js`
const esEjecutadoDirectamente = process.argv[1]?.endsWith("proteusSerialBridge.js");
if (esEjecutadoDirectamente) {
    const bridge = new ProteusSerialBridge().iniciar();

    process.on("SIGINT", () => {
        bridge.detener();
        process.exit(0);
    });
}

export default ProteusSerialBridge;