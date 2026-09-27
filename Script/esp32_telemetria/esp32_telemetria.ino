/*
 * esp32_telemetria.ino
 * ------------------------------------------------------------------
 * Nodo IoT real para una cisterna, sobre ESP32.
 *
 * A diferencia de la simulación en Proteus, aquí NO se usa el puente
 * serial: el ESP32 se conecta directo por Wi-Fi y hace el POST HTTP
 * al backend (POST /api/telemetria/registro), con el mismo formato
 * JSON que ya consume tu TelemetriaController.
 *
 * Sensores reales:
 *   - HC-SR04 (ultrasónico)      -> nivel_carga (litros)
 *   - YF-S201 (flujo, por interrupción) -> flujo_instantaneo (L/min)
 *   - GPS: mockeado por ahora en variables separadas, listo para
 *     reemplazar por lectura real de un NEO-6M (ver sección GPS).
 *
 * Alertas físicas (nuevas):
 *   - LED Verde / Amarillo / Rojo -> estado de la cisterna
 *   - Buzzer activo -> parpadeo 500ms ON / 500ms OFF en estados
 *     ALERTA_CRITICA_VACIO y DESCARGA_INMEDIATA
 *
 * Prioridad de evento (de mayor a menor urgencia; un solo evento por
 * envío, coherente con el firmware de Proteus):
 *   1. FALLA_SENSOR         -> nivel no confiable (LED rojo, sin buzzer)
 *   2. ALERTA_CRITICA_VACIO -> nivel < 5%          (LED rojo + buzzer)
 *   3. DESCARGA_INMEDIATA   -> flujo <= -2.0 L/min  (LED amarillo o rojo + buzzer)
 *   4. ALERTA_NIVEL_BAJO    -> nivel < 20%          (LED amarillo)
 *   5. EN_RUTA              -> operación normal     (LED verde)
 *
 * Sin delay() bloqueantes en el loop principal: todo el muestreo,
 * envío y parpadeo del buzzer usa millis(). El conteo de pulsos de
 * flujo sigue siendo 100% por interrupción (attachInterrupt), así
 * que el parpadeo del buzzer NUNCA compite por tiempo con la captura
 * de pulsos del YF-S201 — ver explicación al final del archivo.
 * ------------------------------------------------------------------
 */

#include <WiFi.h>
#include <HTTPClient.h>

// ---------- Credenciales Wi-Fi ----------
const char* WIFI_SSID     = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD_WIFI";

// ---------- Backend ----------
const char* API_URL = "http://192.168.1.50:3700/api/telemetria/registro";

// ---------- Identificación de esta cisterna ----------
const int ID_CISTERNA = 1;

// ---------- Pines HC-SR04 ----------
const uint8_t PIN_TRIG = 5;
const uint8_t PIN_ECHO = 18;

const float DISTANCIA_TANQUE_VACIO_CM = 150.0; // ajustar según altura real del tanque
const float DISTANCIA_TANQUE_LLENO_CM = 5.0;
const float CAPACIDAD_MAXIMA_LITROS   = 10000.0;

// ---------- Sensor de flujo YF-S201 ----------
const uint8_t PIN_FLUJO = 27; // debe soportar interrupción en el ESP32
const float FACTOR_CALIBRACION_FLUJO = 7.5; // frecuencia(Hz) ≈ 7.5 * Q(L/min)

volatile uint32_t contadorPulsos = 0;

void IRAM_ATTR isrPulsoFlujo() {
  contadorPulsos++;
}

// ---------- Pines de alertas ----------
// GPIO12 es un pin de "strapping" (selecciona el voltaje de la flash
// al arrancar): en la mayoría de placas dev con flash a 3.3V no da
// problema, pero si tu ESP32 no bootea con el LED verde conectado,
// muévelo a otro GPIO libre (ej. GPIO25) y listo.
const uint8_t PIN_LED_VERDE    = 12;
const uint8_t PIN_LED_AMARILLO = 13;
const uint8_t PIN_LED_ROJO     = 14;
const uint8_t PIN_BUZZER       = 26;

// ---------- Umbrales de alerta ----------
const float UMBRAL_NIVEL_BAJO_LITROS    = CAPACIDAD_MAXIMA_LITROS * 0.20; // 2000 L
const float UMBRAL_NIVEL_CRITICO_LITROS = CAPACIDAD_MAXIMA_LITROS * 0.05; // 500 L
const float UMBRAL_DESCARGA_INMEDIATA_LPM = -2.0; // L/min

// ---------- GPS (mockeado por ahora, listo para NEO-6M) ----------
float gpsLatitudActual  = -16.5100000;
float gpsLongitudActual = -68.1300000;

void leerGPS() {
  // --- MOCK: simula un ligero desplazamiento en cada lectura ---
  gpsLatitudActual  += 0.0000500;
  gpsLongitudActual -= 0.0000300;

  // Con el NEO-6M real:
  //   while (gpsSerial.available()) gps.encode(gpsSerial.read());
  //   if (gps.location.isUpdated()) {
  //     gpsLatitudActual  = gps.location.lat();
  //     gpsLongitudActual = gps.location.lng();
  //   }
}

// ---------- Temporización no bloqueante: envío de telemetría ----------
const unsigned long INTERVALO_ENVIO_MS = 5000;
unsigned long ultimoEnvio = 0;
unsigned long ultimaMedicionFlujo = 0;

// ---------- Estado: último nivel válido (por si el HC-SR04 falla) ----------
float ultimoNivelValidoLitros = CAPACIDAD_MAXIMA_LITROS;

// ---------- Temporización no bloqueante: parpadeo del buzzer ----------
const unsigned long INTERVALO_BUZZER_MS = 500; // 500ms ON / 500ms OFF
unsigned long ultimoCambioBuzzer = 0;
bool buzzerEncendido = false;
bool alertaSonoraActiva = false; // true en ALERTA_CRITICA_VACIO o DESCARGA_INMEDIATA

void setup() {
  Serial.begin(115200);

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  pinMode(PIN_FLUJO, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_FLUJO), isrPulsoFlujo, FALLING);

  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_AMARILLO, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LED_VERDE, LOW);
  digitalWrite(PIN_LED_AMARILLO, LOW);
  digitalWrite(PIN_LED_ROJO, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  conectarWiFi();

  ultimoEnvio = millis();
  ultimaMedicionFlujo = millis();
}

void loop() {
  // Mantiene la conexión Wi-Fi sin bloquear el resto del loop.
  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi();
  }

  unsigned long ahora = millis();

  // Se revisa en CADA vuelta del loop, no solo cuando se envía
  // telemetría: así el parpadeo es fluido e independiente del
  // intervalo de envío de 5 s, y nunca "se salta" un ciclo por estar
  // esperando el HTTP POST o la reconexión Wi-Fi.
  actualizarBuzzer(ahora);

  if (ahora - ultimoEnvio >= INTERVALO_ENVIO_MS) {
    bool fallaSensor = false;
    float nivelLitros = leerNivelCargaLitros(fallaSensor);
    float flujo = calcularFlujoInstantaneo(ahora);

    leerGPS();

    const char* evento = determinarEvento(nivelLitros, flujo, fallaSensor);
    actualizarLEDs(evento);

    enviarTelemetria(ID_CISTERNA, gpsLatitudActual, gpsLongitudActual, nivelLitros, flujo, evento);

    ultimoEnvio = ahora;
  }
}

void conectarWiFi() {
  Serial.print("[WiFi] Conectando a ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000UL) {
    delay(250); // aceptable solo aquí: es parte del setup/reconexión, no del loop de muestreo
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("[WiFi] Conectado. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("[WiFi] No se pudo conectar, se reintentará en el próximo loop.");
  }
}

// fallaSensor se marca en true si pulseIn no detecta un eco válido.
// En ese caso se conserva el último nivel real conocido en vez de
// inventar un valor, para no ensuciar el histórico con datos falsos.
float leerNivelCargaLitros(bool &fallaSensor) {
  fallaSensor = false;

  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duracion = pulseIn(PIN_ECHO, HIGH, 30000UL); // timeout 30 ms
  if (duracion == 0) {
    fallaSensor = true;
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

// Calcula el flujo instantáneo (L/min) a partir de los pulsos
// acumulados por interrupción desde la última medición.
float calcularFlujoInstantaneo(unsigned long ahora) {
  noInterrupts();
  uint32_t pulsos = contadorPulsos;
  contadorPulsos = 0;
  interrupts();

  float segundosTranscurridos = (ahora - ultimaMedicionFlujo) / 1000.0;
  ultimaMedicionFlujo = ahora;

  if (segundosTranscurridos <= 0) return 0.0;

  float frecuenciaHz = pulsos / segundosTranscurridos;
  float litrosPorMinuto = frecuenciaHz / FACTOR_CALIBRACION_FLUJO;

  return -litrosPorMinuto; // negativo = descarga, en este circuito
}

// Determina el evento por prioridad. FALLA_SENSOR primero (el dato de
// nivel no es confiable), luego crítico, luego descarga fuerte, luego
// bajo, y por último operación normal.
const char* determinarEvento(float nivel, float flujo, bool fallaSensor) {
  if (fallaSensor) {
    return "FALLA_SENSOR";
  }
  if (nivel < UMBRAL_NIVEL_CRITICO_LITROS) {
    return "ALERTA_CRITICA_VACIO";
  }
  if (flujo <= UMBRAL_DESCARGA_INMEDIATA_LPM) {
    return "DESCARGA_INMEDIATA";
  }
  if (nivel < UMBRAL_NIVEL_BAJO_LITROS) {
    return "ALERTA_NIVEL_BAJO";
  }
  return "EN_RUTA";
}

// Enciende el LED correspondiente y decide si el buzzer debe sonar.
// Para DESCARGA_INMEDIATA, el color depende de si el nivel ya estaba
// bajo (rojo, más urgente) o normal (amarillo, advertencia temprana).
void actualizarLEDs(const char* evento) {
  bool verde = false, amarillo = false, rojo = false;
  alertaSonoraActiva = false;

  if (strcmp(evento, "FALLA_SENSOR") == 0) {
    rojo = true; // sin buzzer: es una falla de dato, no una emergencia de nivel
  } else if (strcmp(evento, "ALERTA_CRITICA_VACIO") == 0) {
    rojo = true;
    alertaSonoraActiva = true;
  } else if (strcmp(evento, "DESCARGA_INMEDIATA") == 0) {
    if (ultimoNivelValidoLitros < UMBRAL_NIVEL_BAJO_LITROS) {
      rojo = true;
    } else {
      amarillo = true;
    }
    alertaSonoraActiva = true;
  } else if (strcmp(evento, "ALERTA_NIVEL_BAJO") == 0) {
    amarillo = true;
  } else { // EN_RUTA
    verde = true;
  }

  digitalWrite(PIN_LED_VERDE, verde ? HIGH : LOW);
  digitalWrite(PIN_LED_AMARILLO, amarillo ? HIGH : LOW);
  digitalWrite(PIN_LED_ROJO, rojo ? HIGH : LOW);
}

// Alterna el buzzer cada INTERVALO_BUZZER_MS (500ms ON / 500ms OFF)
// mientras alertaSonoraActiva sea true; se apaga de inmediato apenas
// deja de serlo. No usa delay() en ningún momento, así que nunca
// bloquea la ISR de flujo ni el resto del loop.
void actualizarBuzzer(unsigned long ahora) {
  if (!alertaSonoraActiva) {
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

void enviarTelemetria(int idCisterna, float lat, float lon, float nivel, float flujo, const char* evento) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Sin conexión Wi-Fi, se omite el envío.");
    return;
  }

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  char cuerpo[260]; // ampliado respecto al original (220) para el campo "evento"
  snprintf(cuerpo, sizeof(cuerpo),
           "{\"id_cisterna\":%d,\"latitud\":%.7f,\"longitud\":%.7f,"
           "\"nivel_carga\":%.2f,\"flujo_instantaneo\":%.2f,"
           "\"evento\":\"%s\"}",
           idCisterna, lat, lon, nivel, flujo, evento);

  int codigoRespuesta = http.POST(cuerpo);

  if (codigoRespuesta > 0) {
    Serial.print("[HTTP] POST enviado, código: ");
    Serial.println(codigoRespuesta);
  } else {
    Serial.print("[HTTP] Error al enviar POST: ");
    Serial.println(http.errorToString(codigoRespuesta));
  }

  http.end();
}
