import crypto from "crypto";
import { connect } from "../database.js";

/**
 * ConductorService
 * ------------------------------------------------------------------
 * La CI es un dato confidencial (Ley de datos personales / buenas
 * prácticas): nunca se guarda en texto plano.
 *
 * Estrategia de cifrado (coherente con los comentarios ya presentes
 * en tu tabla `conductores`):
 *   - `ci_encriptado` (varbinary): CI cifrada con AES-256-GCM. Se
 *     guardan concatenados IV (16 bytes) + AuthTag (16 bytes) +
 *     Ciphertext, todo en un solo Buffer. GCM es autenticado: si el
 *     dato fue alterado, `decipher.final()` lanza una excepción en
 *     vez de devolver basura silenciosamente.
 *   - `ci_hash` (char(64), UNIQUE): SHA-256 de la CI en texto plano.
 *     Permite comparar/buscar duplicados por CI sin desencriptar
 *     nada, ya que un hash determinístico del mismo CI siempre da el
 *     mismo resultado (a diferencia del cifrado AES-GCM, que usa un
 *     IV distinto cada vez y por lo tanto nunca es comparable
 *     directamente).
 *
 * La clave de cifrado NUNCA debe vivir en el código: se lee de
 * `process.env.CI_ENCRYPTION_KEY`, que debe ser una cadena hex de
 * 64 caracteres (32 bytes) generada una sola vez, por ejemplo con:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * ------------------------------------------------------------------
 */
class ConductorService {
    constructor() {
        this.ALGORITMO = "aes-256-gcm";
        this.IV_LENGTH = 16;

        const keyHex = process.env.CI_ENCRYPTION_KEY;
        if (!keyHex || keyHex.length !== 64) {
            console.warn(
                "[ConductorService] ADVERTENCIA: CI_ENCRYPTION_KEY no está definida o no tiene 32 bytes (64 caracteres hex)."
            );
        }
        this.encryptionKey = keyHex ? Buffer.from(keyHex, "hex") : null;
    }

    // ------------------------------------------------------------
    // Cifrado / hashing (privados a la clase por convención de _prefijo)
    // ------------------------------------------------------------
    _encriptarCI(ciPlano) {
        const iv = crypto.randomBytes(this.IV_LENGTH);
        const cipher = crypto.createCipheriv(this.ALGORITMO, this.encryptionKey, iv);

        const cifrado = Buffer.concat([cipher.update(ciPlano, "utf8"), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Empaquetamos todo en un solo Buffer: [IV(16)][AuthTag(16)][Ciphertext(N)]
        return Buffer.concat([iv, authTag, cifrado]);
    }

    _desencriptarCI(bufferCompleto) {
        const iv = bufferCompleto.subarray(0, this.IV_LENGTH);
        const authTag = bufferCompleto.subarray(this.IV_LENGTH, this.IV_LENGTH + 16);
        const cifrado = bufferCompleto.subarray(this.IV_LENGTH + 16);

        const decipher = crypto.createDecipheriv(this.ALGORITMO, this.encryptionKey, iv);
        decipher.setAuthTag(authTag);

        const descifrado = Buffer.concat([decipher.update(cifrado), decipher.final()]);
        return descifrado.toString("utf8");
    }

    _hashCI(ciPlano) {
        return crypto.createHash("sha256").update(ciPlano).digest("hex");
    }

    // ------------------------------------------------------------
    // CRUD
    // ------------------------------------------------------------

    // POST /conductores
    async crear({ nombre_completo, ci, licencia_conducir, telefono }) {
        const db = connect();
        const ci_hash = this._hashCI(ci);

        const [duplicados] = await db.query(
            "SELECT id_conductor FROM conductores WHERE ci_hash = ? LIMIT 1",
            [ci_hash]
        );

        if (duplicados.length > 0) {
            const err = new Error("Ya existe un conductor registrado con esa CI.");
            err.status = 409;
            throw err;
        }

        const ci_encriptado = this._encriptarCI(ci);

        const [resultado] = await db.query(
            `INSERT INTO conductores
                (nombre_completo, ci_encriptado, ci_hash, licencia_conducir, telefono, estado)
             VALUES (?, ?, ?, ?, ?, 'ACTIVO')`,
            [nombre_completo, ci_encriptado, ci_hash, licencia_conducir ?? null, telefono ?? null]
        );

        return this.obtenerPorId(resultado.insertId);
    }

    // GET /conductores/:id  (incluye la CI desencriptada; endpoint sensible)
    async obtenerPorId(id_conductor) {
        const db = connect();
        const [filas] = await db.query(
            `SELECT id_conductor, nombre_completo, ci_encriptado, licencia_conducir,
                    telefono, fecha_registro, estado
               FROM conductores
              WHERE id_conductor = ?
              LIMIT 1`,
            [id_conductor]
        );

        if (filas.length === 0) return null;

        const conductor = filas[0];
        const ciBuffer = conductor.ci_encriptado;
        delete conductor.ci_encriptado;

        conductor.ci = this._desencriptarCI(ciBuffer);

        return conductor;
    }

    // GET /obtener/conductores?estado=ACTIVO
    // Listado SIN CI desencriptada: minimiza exposición del dato confidencial
    // cuando solo se necesita ver quiénes están registrados.
    async listar({ estado } = {}) {
        const db = connect();

        const condiciones = [];
        const parametros = [];

        if (estado) {
            condiciones.push("estado = ?");
            parametros.push(estado);
        }

        const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

        const [filas] = await db.query(
            `SELECT id_conductor, nombre_completo, licencia_conducir, telefono,
                    fecha_registro, estado
               FROM conductores
               ${where}
              ORDER BY nombre_completo ASC`,
            parametros
        );

        return filas;
    }

    // PATCH /conductores/:id/estado
    async actualizarEstado(id_conductor, estado) {
        const db = connect();

        const [existe] = await db.query(
            "SELECT id_conductor FROM conductores WHERE id_conductor = ? LIMIT 1",
            [id_conductor]
        );

        if (existe.length === 0) {
            const err = new Error(`No se encontró un conductor con id ${id_conductor}.`);
            err.status = 404;
            throw err;
        }

        await db.query("UPDATE conductores SET estado = ? WHERE id_conductor = ?", [
            estado,
            id_conductor,
        ]);

        return this.obtenerPorId(id_conductor);
    }
}

export default ConductorService;