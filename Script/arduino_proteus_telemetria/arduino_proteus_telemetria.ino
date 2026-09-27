/*
 * arduino_proteus_telemetria.ino
 * ------------------------------------------------------------------
 * Simulación en Proteus del nodo IoT de una cisterna, con alertas
 * visuales/sonoras en placa y evento lógico incluido en el JSON.
 *
 * Sensores simulados:
 *   - HC-SR04 (ultrasónico)  -> nivel_carga (litros)
 *   - Potenciómetro en A0    -> flujo_instantaneo (L/min, negativo = descarga)
 *
 * Salida: una línea JSON por Serial.println() cada INTERVALO_MS,
 * a 9600 baudios, que el COMPIM entrega al puerto COM virtual y de
 * ahí lo recoge proteusSerialBridge.js.
 *
 * Formato JSON (ahora con "evento"):
 *   {"id_cisterna":1,"latitud":-16.5100000,"longitud":-68.1300000,
 *    "nivel_carga":1500.00,"flujo_instantaneo":-25.50,
 *    "evento":"ALERTA_NIVEL_BAJO"}
 *
 * Prioridad de eventos (de mayor a menor urgencia; solo se reporta
 * y se enciende UN LED "principal" a la vez, salvo el buzzer que
 * acompaña únicamente a los estados críticos):
 *   1. FALLA_SENSOR         -> el dato de nivel no es confiable
 *   2. ALERTA_CRITICA_VACIO -> nivel < 5%
 *   3. ALERTA_NIVEL_BAJO    -> nivel < 20%
 *   4. DESCARGA_INMEDIATA   -> flujo de descarga muy alto
 *   5. EN_RUTA              -> operación normal
 *
 * Sin delay() bloqueantes: todo (muestreo, envío y parpadeo del
 * buzzer) se controla con millis(). El único bloqueo corto es
 * pulseIn() del HC-SR04 (tiene timeout, dura como máximo unos ms).
 * ------------------------------------------------------------------
 */

// ---------- Configuración de pines: sensores ----------
const uint8_t PIN_TRIG = 9;   // HC-SR04 Trigger
const uint8_t PIN_ECHO = 10;  // HC-SR04 Echo
const uint8_t PIN_POT  = A0;  // Potenciómetro -> simula flujo instantáneo

// ---------- Configuración de pines: alertas ----------
const uint8_t PIN_LED_VERDE    = 5; // Estado normal
const uint8_t PIN_LED_AMARILLO = 6; // Advertencia
const uint8_t PIN_LED_ROJO     = 7; // Crítico
const uint8_t PIN_BUZZER       = 8; // Zumbador (activo solo en estado crítico)

// ---------- Parámetros del "tanque" simulado ----------
const float DISTANCIA_TANQUE_VACIO_CM = 40.0;  // eco cuando el tanque está vacío
const float DISTANCIA_TANQUE_LLENO_CM = 4.0;   // eco cuando el tanque está lleno
const float CAPACIDAD_MAXIMA_LITROS   = 10000.0;

// ---------- Umbrales de alerta ----------
const float UMBRAL_NIVEL_BAJO_LITROS    = CAPACIDAD_MAXIMA_LITROS * 0.20; // 2000 L
const float UMBRAL_NIVEL_CRITICO_LITROS = CAPACIDAD_MAXIMA_LITROS * 0.05; // 500 L
const float UMBRAL_DESCARGA_ALTA_LPM    = -25.0; // L/min; flujo <= esto = descarga fuerte

// ---------- Datos fijos / de identificación ----------
const int ID_CISTERNA = 1;

// ---------- Ruta simulada (lat/long estáticas por tramo) ----------
struct PuntoRuta {
  float lat;
  float lon;
};

const PuntoRuta RUTA[] = {
  { -16.5100000, -68.1300000 },
  { -16.5102000, -68.1298000 },
  { -16.5104000, -68.1296500 },
  { -16.5106500, -68.1295000 },
  { -16.5108000, -68.1293200 },
};
const uint8_t TOTAL_PUNTOS_RUTA = sizeof(RUTA) / sizeof(RUTA[0]);
uint8_t indiceRuta = 0;

// ---------- Temporización no bloqueante: envío de telemetría ----------
const unsigned long INTERVALO_MS = 3000; // cada 3 segundos
unsigned long ultimoEnvio = 0;

// ---------- Estado para conservar el último nivel válido ----------
// Si el HC-SR04 falla (duracion == 0), en vez de inventar un valor
// (antes se asumía "tanque lleno", lo que ocultaba la falla) se
// conserva el último nivel real conocido y se reporta FALLA_SENSOR.
float ultimoNivelValidoLitros = CAPACIDAD_MAXIMA_LITROS;

// ---------- Temporización no bloqueante: parpadeo del buzzer ----------
const unsigned long INTERVALO_BUZZER_MS = 300;
unsigned long ultimoCambioBuzzer = 0;
bool buzzerEncendido = false;
bool alertaCriticaActiva = false; // true cuando el estado actual es crítico

void setup() {
  Serial.begin(9600);

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_AMARILLO, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  digitalWrite(PIN_LED_VERDE, LOW);
  digitalWrite(PIN_LED_AMARILLO, LOW);
  digitalWrite(PIN_LED_ROJO, LOW);
  digitalWrite(PIN_BUZZER, LOW);
}

void loop() {
  unsigned long ahora = millis();

  // El buzzer se revisa en CADA vuelta del loop (no solo cuando se
  // envía telemetría), para que el parpadeo sea fluido e independiente
  // del intervalo de envío de 3 s.
  actualizarBuzzer(ahora);

  if (ahora - ultimoEnvio >= INTERVALO_MS) {
    ultimoEnvio = ahora;
    enviarLectura();
  }
}

void enviarLectura() {
  bool fallaSensor = false;
  float nivelLitros = leerNivelCargaLitros(fallaSensor);
  float flujo = leerFlujoInstantaneo();
  PuntoRuta punto = siguientePuntoRuta();

  const char* evento = determinarEvento(nivelLitros, flujo, fallaSensor);
  actualizarLEDs(evento);

  imprimirJSON(ID_CISTERNA, punto.lat, punto.lon, nivelLitros, flujo, evento);
}

// Lee el HC-SR04 y convierte la distancia en litros dentro del tanque.
// fallaSensor se marca en true si pulseIn no detecta un eco válido.
float leerNivelCargaLitros(bool &fallaSensor) {
  fallaSensor = false;

  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(4);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(20); // ensanchado respecto al mínimo de 10us del datasheet,
                         // para evitar que simuladores con paso de tiempo
                         // grueso "pierdan" el pulso (ver notas de depuración)
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duracion = pulseIn(PIN_ECHO, HIGH, 30000UL); // timeout 30 ms

  if (duracion == 0) {
    fallaSensor = true;
    // No se asume "tanque lleno": se conserva el último valor real
    // conocido para no ensuciar el histórico con datos inventados.
    return ultimoNivelValidoLitros;
  }

  float distanciaCm = (duracion * 0.0343) / 2.0;
  distanciaCm = constrain(distanciaCm, DISTANCIA_TANQUE_LLENO_CM, DISTANCIA_TANQUE_VACIO_CM);

  float porcentajeLleno = 1.0 - ((distanciaCm - DISTANCIA_TANQUE_LLENO_CM) /
                                  (DISTANCIA_TANQUE_VACIO_CM - DISTANCIA_TANQUE_LLENO_CM));

  float nivel = porcentajeLleno * CAPACIDAD_MAXIMA_LITROS;
  ultimoNivelValidoLitros = nivel;
  return nivel;
}

// Lee el potenciómetro (0-1023) y lo mapea a un flujo simulado en L/min.
float leerFlujoInstantaneo() {
  int lecturaCruda = analogRead(PIN_POT);
  float flujo = map(lecturaCruda, 0, 1023, -3000, 0) / 100.0; // -30.00 a 0.00 L/min
  return flujo;
}

PuntoRuta siguientePuntoRuta() {
  PuntoRuta punto = RUTA[indiceRuta];
  indiceRuta = (indiceRuta + 1) % TOTAL_PUNTOS_RUTA;
  return punto;
}

// Determina el evento lógico según prioridad. Devuelve un puntero a
// una cadena literal (vive en flash/RAM estática, segura de retornar).
const char* determinarEvento(float nivel, float flujo, bool fallaSensor) {
  if (fallaSensor) {
    return "FALLA_SENSOR";
  }
  if (nivel < UMBRAL_NIVEL_CRITICO_LITROS) {
    return "ALERTA_CRITICA_VACIO";
  }
  if (nivel < UMBRAL_NIVEL_BAJO_LITROS) {
    return "ALERTA_NIVEL_BAJO";
  }
  if (flujo <= UMBRAL_DESCARGA_ALTA_LPM) {
    return "DESCARGA_INMEDIATA";
  }
  return "EN_RUTA";
}

// Enciende el LED correspondiente al evento actual y habilita/deshabilita
// la bandera que activa el parpadeo no bloqueante del buzzer.
void actualizarLEDs(const char* evento) {
  bool esNormal = (strcmp(evento, "EN_RUTA") == 0);
  bool esAdvertencia = (strcmp(evento, "ALERTA_NIVEL_BAJO") == 0) ||
                       (strcmp(evento, "DESCARGA_INMEDIATA") == 0);
  bool esCritico = (strcmp(evento, "ALERTA_CRITICA_VACIO") == 0) ||
                    (strcmp(evento, "FALLA_SENSOR") == 0);

  digitalWrite(PIN_LED_VERDE, esNormal ? HIGH : LOW);
  digitalWrite(PIN_LED_AMARILLO, esAdvertencia ? HIGH : LOW);
  digitalWrite(PIN_LED_ROJO, esCritico ? HIGH : LOW);

  alertaCriticaActiva = esCritico;
}

// Alterna el buzzer cada INTERVALO_BUZZER_MS mientras el estado sea
// crítico; se apaga de inmediato apenas deja de serlo. No bloquea el
// loop en ningún momento.
void actualizarBuzzer(unsigned long ahora) {
  if (!alertaCriticaActiva) {
    if (buzzerEncendido) {
      digitalWrite(PIN_BUZZER, LOW);
      buzzerEncendido = false;
    }
    return;
  }

  if (ahora - ultimoCambioBuzzer >= INTERVALO_BUZZER_MS) {
    ultimoCambioBuzzer = ahora;
    buzzerEncendido = !buzzerEncendido;
    digitalWrite(PIN_BUZZER, buzzerEncendido ? HIGH : LOW);
  }
}

// Arma la línea JSON (con el nuevo campo "evento") y la envía por Serial.
void imprimirJSON(int idCisterna, float lat, float lon, float nivel, float flujo, const char* evento) {
  Serial.print("{\"id_cisterna\":");
  Serial.print(idCisterna);
  Serial.print(",\"latitud\":");
  Serial.print(lat, 7);
  Serial.print(",\"longitud\":");
  Serial.print(lon, 7);
  Serial.print(",\"nivel_carga\":");
  Serial.print(nivel, 2);
  Serial.print(",\"flujo_instantaneo\":");
  Serial.print(flujo, 2);
  Serial.print(",\"evento\":\"");
  Serial.print(evento);
  Serial.println("\"}");
}
