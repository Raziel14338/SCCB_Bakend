import { SerialPort } from "serialport";

/**
 * simularArduino.js
 * ------------------------------------------------------------------
 * NO es parte del proyecto final: es solo para probar el pipeline
 * COM3 -> COM4 -> proteusSerialBridge.js -> API -> base de datos,
 * SIN depender todavía de que la simulación de Proteus esté armada.
 *
 * Este script hace lo que haría el Arduino: escribe una línea JSON
 * por el puerto COM3 cada pocos segundos. proteusSerialBridge.js,
 * escuchando en COM4 (el otro extremo del mismo par virtual), debería
 * recibir cada línea y reenviarla a tu API.
 *
 * Ejecuta este script en OTRA terminal, con el backend Y
 * proteusSerialBridge.js ya corriendo.
 *
 * Uso: npx babel-node Script/simularArduino.js
 * ------------------------------------------------------------------
 */

const PUERTO_ARDUINO = process.env.SERIAL_PORT_ARDUINO || "COM3"; // el extremo que en la vida real usaría Proteus
const BAUD_RATE = Number(process.env.SERIAL_BAUD_RATE || 9600);
const ID_CISTERNA_PRUEBA = Number(process.env.ID_CISTERNA_PRUEBA || 1); // debe existir en tu tabla `cisternas`

const puerto = new SerialPort({ path: PUERTO_ARDUINO, baudRate: BAUD_RATE }, (err) => {
    if (err) {
        console.error(`[SimuladorArduino] No se pudo abrir ${PUERTO_ARDUINO}:`, err.message);
        process.exit(1);
    }
});

puerto.on("open", () => {
    console.log(`[SimuladorArduino] Puerto ${PUERTO_ARDUINO} abierto. Enviando datos cada 3s...`);

    let nivelCarga = 9500; // arranca en 9500 litros y va bajando, simulando una descarga

    setInterval(() => {
        nivelCarga -= 15; // simula el flujo de descarga

        const lectura = {
            id_cisterna: ID_CISTERNA_PRUEBA,
            latitud: -16.51 + (Math.random() - 0.5) * 0.001,
            longitud: -68.13 + (Math.random() - 0.5) * 0.001,
            nivel_carga: Math.max(nivelCarga, 0),
            flujo_instantaneo: -15.5,
        };

        const linea = JSON.stringify(lectura) + "\n";

        puerto.write(linea, (err) => {
            if (err) {
                console.error("[SimuladorArduino] Error al escribir en el puerto:", err.message);
            } else {
                console.log("[SimuladorArduino] Enviado:", linea.trim());
            }
        });
    }, 3000);
});

puerto.on("error", (err) => {
    console.error("[SimuladorArduino] Error de puerto:", err.message);
});
