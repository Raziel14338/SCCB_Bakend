-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 27-09-2026 a las 18:07:53
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.1.25

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `sccb`
--

DELIMITER $$
--
-- Procedimientos
--
CREATE DEFINER=`` PROCEDURE `sp_validar_y_consumir_cupo` (IN `p_placa` VARCHAR(15), IN `p_volumen_solicitado` DECIMAL(8,2), OUT `p_autorizado` BOOLEAN, OUT `p_mensaje` VARCHAR(255), OUT `p_id_cupo` INT)   BEGIN
    DECLARE v_id_vehiculo        INT DEFAULT NULL;
    DECLARE v_estado_vehiculo    VARCHAR(20);
    DECLARE v_id_cupo            INT DEFAULT NULL;
    DECLARE v_volumen_autorizado DECIMAL(10,2);
    DECLARE v_volumen_consumido  DECIMAL(10,2);
    DECLARE v_nuevo_consumido    DECIMAL(10,2);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_autorizado = FALSE;
        SET p_mensaje = 'Error interno al validar el cupo. Operación revertida.';
        SET p_id_cupo = NULL;
    END;

    START TRANSACTION;

    SELECT id_vehiculo, estado
      INTO v_id_vehiculo, v_estado_vehiculo
      FROM vehiculos
     WHERE placa = p_placa
     LIMIT 1;

    IF v_id_vehiculo IS NULL THEN
        SET p_autorizado = FALSE;
        SET p_mensaje = CONCAT('No existe un vehiculo registrado con placa ', p_placa, '.');
        SET p_id_cupo = NULL;
        ROLLBACK;

    ELSEIF v_estado_vehiculo <> 'ACTIVO' THEN
        SET p_autorizado = FALSE;
        SET p_mensaje = 'El vehiculo se encuentra bloqueado o inactivo.';
        SET p_id_cupo = NULL;
        ROLLBACK;

    ELSE
        SELECT id_cupo, volumen_autorizado, volumen_consumido
          INTO v_id_cupo, v_volumen_autorizado, v_volumen_consumido
          FROM cupos
         WHERE id_vehiculo = v_id_vehiculo
           AND estado = 'VIGENTE'
           AND CURDATE() BETWEEN fecha_inicio AND fecha_fin
         ORDER BY fecha_inicio DESC
         LIMIT 1
         FOR UPDATE;

        IF v_id_cupo IS NULL THEN
            SET p_autorizado = FALSE;
            SET p_mensaje = 'El vehiculo no tiene un cupo vigente para el periodo actual.';
            SET p_id_cupo = NULL;
            ROLLBACK;

        ELSEIF (v_volumen_consumido + p_volumen_solicitado) > v_volumen_autorizado THEN
            SET p_autorizado = FALSE;
            SET p_mensaje = CONCAT(
                'Cupo insuficiente. Disponible: ',
                (v_volumen_autorizado - v_volumen_consumido), ' litros.'
            );
            SET p_id_cupo = v_id_cupo;
            ROLLBACK;

        ELSE
            -- Se calcula el nuevo consumo en una variable ANTES del UPDATE:
            -- MySQL evalúa las asignaciones de un SET de izquierda a derecha,
            -- así que si el cálculo de `estado` referenciara directamente a
            -- `volumen_consumido` en la misma sentencia, ya vería el valor
            -- recién actualizado (no el original) y duplicaría el incremento.
            SET v_nuevo_consumido = v_volumen_consumido + p_volumen_solicitado;

            UPDATE cupos
               SET volumen_consumido = v_nuevo_consumido,
                   estado = IF(v_nuevo_consumido >= v_volumen_autorizado, 'AGOTADO', estado)
             WHERE id_cupo = v_id_cupo;

            SET p_autorizado = TRUE;
            SET p_mensaje = 'Despacho autorizado.';
            SET p_id_cupo = v_id_cupo;

            COMMIT;
        END IF;
    END IF;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `alertas`
--

CREATE TABLE `alertas` (
  `id_alerta` bigint(20) NOT NULL,
  `tipo_alerta` enum('MERMA_IRREGULAR','DESVIO_RUTA','TIEMPO_MUERTO','DISCREPANCIA_VOLUMEN','CUPO_EXCEDIDO','CREDENCIAL_DUPLICADA','ACCESO_NO_AUTORIZADO') NOT NULL,
  `descripcion` varchar(500) NOT NULL,
  `severidad` enum('BAJA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'MEDIA',
  `id_cisterna` int(11) DEFAULT NULL,
  `id_vehiculo` int(11) DEFAULT NULL,
  `id_estacion` int(11) DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp(),
  `estado` enum('ABIERTA','EN_REVISION','RESUELTA','DESCARTADA') NOT NULL DEFAULT 'ABIERTA',
  `id_usuario_resolucion` int(11) DEFAULT NULL COMMENT 'Usuario ANH/YPFB que atendi? la alerta',
  `fecha_resolucion` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Alertas autom?ticas de fiscalizaci?n y control anti-contrabando';

--
-- Volcado de datos para la tabla `alertas`
--

INSERT INTO `alertas` (`id_alerta`, `tipo_alerta`, `descripcion`, `severidad`, `id_cisterna`, `id_vehiculo`, `id_estacion`, `fecha_hora`, `estado`, `id_usuario_resolucion`, `fecha_resolucion`) VALUES
(1, 'MERMA_IRREGULAR', 'Diferencia de 300 litros entre salida de acopio y llegada a estaci?n', 'ALTA', 1, NULL, 1, '2026-09-26 11:28:23', 'ABIERTA', NULL, NULL),
(2, 'CUPO_EXCEDIDO', 'Veh?culo 9012-JKL intent? despacho superando su cupo mensual', 'CRITICA', NULL, 3, 2, '2026-09-26 11:28:23', 'ABIERTA', NULL, NULL),
(3, 'DESVIO_RUTA', 'Cisterna CIS-002 se detuvo fuera de ruta autorizada por m?s de 40 min', 'MEDIA', 2, NULL, NULL, '2026-09-26 11:28:23', 'EN_REVISION', NULL, NULL);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `centros_acopio`
--

CREATE TABLE `centros_acopio` (
  `id_centro` int(11) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `ubicacion` varchar(255) NOT NULL,
  `latitud` decimal(10,7) DEFAULT NULL,
  `longitud` decimal(10,7) DEFAULT NULL,
  `capacidad_almacen` decimal(12,2) NOT NULL COMMENT 'Litros',
  `estado` enum('OPERATIVO','INACTIVO') NOT NULL DEFAULT 'OPERATIVO'
) ;

--
-- Volcado de datos para la tabla `centros_acopio`
--

INSERT INTO `centros_acopio` (`id_centro`, `nombre`, `ubicacion`, `latitud`, `longitud`, `capacidad_almacen`, `estado`) VALUES
(1, 'Centro de Acopio El Alto', 'El Alto, La Paz', -16.5000000, -68.1500000, 500000.00, 'OPERATIVO'),
(2, 'Centro de Acopio Santa Cruz', 'Santa Cruz de la Sierra', -17.7833000, -63.1821000, 750000.00, 'OPERATIVO');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cisternas`
--

CREATE TABLE `cisternas` (
  `id_cisterna` int(11) NOT NULL,
  `placa` varchar(15) NOT NULL,
  `rfid_tag` varchar(50) DEFAULT NULL,
  `empresa_transporte` varchar(150) NOT NULL,
  `capacidad_total` decimal(10,2) NOT NULL COMMENT 'Litros',
  `sensor_iot_id` varchar(50) DEFAULT NULL COMMENT 'Identificador del dispositivo IoT instalado',
  `estado` enum('OPERATIVA','MANTENIMIENTO','FUERA_DE_SERVICIO') NOT NULL DEFAULT 'OPERATIVA',
  `fecha_registro` timestamp NOT NULL DEFAULT current_timestamp()
) ;

--
-- Volcado de datos para la tabla `cisternas`
--

INSERT INTO `cisternas` (`id_cisterna`, `placa`, `rfid_tag`, `empresa_transporte`, `capacidad_total`, `sensor_iot_id`, `estado`, `fecha_registro`) VALUES
(1, 'CIS-001', 'RFID-CIS-001', 'Transportes YPFB Norte', 10000.00, 'IOT-SENSOR-001', 'OPERATIVA', '2026-09-26 15:28:23'),
(2, 'CIS-002', 'RFID-CIS-002', 'Transportes YPFB Sur', 12000.00, 'IOT-SENSOR-002', 'OPERATIVA', '2026-09-26 15:28:23');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `conductores`
--

CREATE TABLE `conductores` (
  `id_conductor` int(11) NOT NULL,
  `nombre_completo` varchar(150) NOT NULL,
  `ci_encriptado` varbinary(255) NOT NULL COMMENT 'N?mero de CI cifrado con AES_ENCRYPT',
  `ci_hash` char(64) NOT NULL COMMENT 'SHA-256 del CI en texto plano, para b?squedas/duplicados sin exponer el dato',
  `licencia_conducir` varchar(30) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `fecha_registro` timestamp NOT NULL DEFAULT current_timestamp(),
  `estado` enum('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Datos confidenciales de conductores/usuarios de combustible';

--
-- Volcado de datos para la tabla `conductores`
--

INSERT INTO `conductores` (`id_conductor`, `nombre_completo`, `ci_encriptado`, `ci_hash`, `licencia_conducir`, `telefono`, `fecha_registro`, `estado`) VALUES
(1, 'Gustavo Quispe Pacheco', 0x24c20e5e6227caeb978b77d910533bba, '5378d390a0c2286040afbb4cd7586bdf1639a78fcbc4bba0fd4c5ac2146549e8', 'LIC-778899', '70011122', '2026-09-26 15:28:23', 'ACTIVO'),
(2, 'Maria Fernanda Rojas', 0x37cb31309b7cd43715cb2f2506bb616d, 'b32b674b0aff695c5f9549ad0375adbf387b1069b06a6a2672c5b544a1927cc6', 'LIC-445566', '70022233', '2026-09-26 15:28:23', 'ACTIVO'),
(3, 'Carlos Andres Mamani', 0xd0fc8c427a9e447df225ff6030a8d7bf, 'b78fa998f50c270799b386df3f498568f47277e00b16b918a5727d21819f0cf8', 'LIC-112233', '70033344', '2026-09-26 15:28:23', 'ACTIVO');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cupos`
--

CREATE TABLE `cupos` (
  `id_cupo` int(11) NOT NULL,
  `id_vehiculo` int(11) NOT NULL,
  `volumen_autorizado` decimal(10,2) NOT NULL COMMENT 'Litros autorizados en el periodo',
  `volumen_consumido` decimal(10,2) NOT NULL DEFAULT 0.00,
  `periodo` enum('SEMANAL','QUINCENAL','MENSUAL') NOT NULL DEFAULT 'MENSUAL',
  `fecha_inicio` date NOT NULL,
  `fecha_fin` date NOT NULL,
  `estado` enum('VIGENTE','AGOTADO','SUSPENDIDO','VENCIDO') NOT NULL DEFAULT 'VIGENTE',
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

--
-- Volcado de datos para la tabla `cupos`
--

INSERT INTO `cupos` (`id_cupo`, `id_vehiculo`, `volumen_autorizado`, `volumen_consumido`, `periodo`, `fecha_inicio`, `fecha_fin`, `estado`, `fecha_actualizacion`) VALUES
(1, 1, 120.00, 30.00, 'MENSUAL', '2026-09-01', '2026-09-30', 'VIGENTE', '2026-09-26 15:28:23'),
(2, 2, 200.00, 195.00, 'MENSUAL', '2026-09-01', '2026-09-30', 'VIGENTE', '2026-09-26 15:28:23'),
(3, 3, 600.00, 600.00, 'MENSUAL', '2026-09-01', '2026-09-30', 'AGOTADO', '2026-09-26 15:28:23');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `despachos`
--

CREATE TABLE `despachos` (
  `id_despacho` bigint(20) NOT NULL,
  `id_surtidor` int(11) NOT NULL,
  `id_vehiculo` int(11) NOT NULL,
  `id_cupo` int(11) NOT NULL,
  `id_conductor` int(11) NOT NULL,
  `id_usuario_operador` int(11) NOT NULL COMMENT 'Usuario/personal de estaci?n que atendi?',
  `volumen_despachado` decimal(8,2) NOT NULL COMMENT 'Litros',
  `metodo_identificacion` enum('RFID','OCR','MANUAL') NOT NULL DEFAULT 'RFID',
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp(),
  `estado_transaccion` enum('AUTORIZADO','DENEGADO','ANULADO') NOT NULL DEFAULT 'AUTORIZADO',
  `hash_transmision` char(64) DEFAULT NULL COMMENT 'Hash SHA-256 para verificar integridad del registro transmitido por VPN'
) ;

--
-- Volcado de datos para la tabla `despachos`
--

INSERT INTO `despachos` (`id_despacho`, `id_surtidor`, `id_vehiculo`, `id_cupo`, `id_conductor`, `id_usuario_operador`, `volumen_despachado`, `metodo_identificacion`, `fecha_hora`, `estado_transaccion`, `hash_transmision`) VALUES
(1, 1, 1, 1, 1, 4, 30.00, 'RFID', '2026-09-26 11:28:23', 'AUTORIZADO', 'eea998cf0dab1c4edc5a87a00beca2ec202e5a238f30ad34dfac7cdb8db3098b'),
(2, 1, 2, 2, 2, 4, 45.00, 'OCR', '2026-09-26 11:28:23', 'AUTORIZADO', 'e51f577b25b1566f027645f1c35fae92ee6bf4b5b0c76afd124a5cff03feb850'),
(3, 2, 3, 3, 3, 4, 0.00, 'RFID', '2026-09-26 11:28:23', 'DENEGADO', 'f449db5db0da09163a2bbc7d98e125b9f85821f2c5bb9fd26255be92c9c60dab');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `estaciones_servicio`
--

CREATE TABLE `estaciones_servicio` (
  `id_estacion` int(11) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `codigo_ypfb` varchar(30) NOT NULL COMMENT 'C?digo de habilitaci?n B-SISA/YPFB',
  `ubicacion` varchar(255) NOT NULL,
  `latitud` decimal(10,7) DEFAULT NULL,
  `longitud` decimal(10,7) DEFAULT NULL,
  `estado` enum('OPERATIVA','SUSPENDIDA','CERRADA') NOT NULL DEFAULT 'OPERATIVA'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Estaciones de servicio (puntos de venta final)';

--
-- Volcado de datos para la tabla `estaciones_servicio`
--

INSERT INTO `estaciones_servicio` (`id_estacion`, `nombre`, `codigo_ypfb`, `ubicacion`, `latitud`, `longitud`, `estado`) VALUES
(1, 'Estaci?n Central La Paz', 'YPFB-EST-001', 'Av. 6 de Agosto, La Paz', -16.5100000, -68.1300000, 'OPERATIVA'),
(2, 'Estaci?n Norte Cochabamba', 'YPFB-EST-002', 'Av. Blanco Galindo, Cochabamba', -17.3895000, -66.1568000, 'OPERATIVA');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `inventario`
--

CREATE TABLE `inventario` (
  `id_movimiento` bigint(20) NOT NULL,
  `tipo_movimiento` enum('ENTRADA','SALIDA') NOT NULL,
  `id_centro_acopio` int(11) DEFAULT NULL,
  `id_estacion` int(11) DEFAULT NULL,
  `id_cisterna` int(11) DEFAULT NULL COMMENT 'Cisterna que transport? el volumen (si aplica)',
  `tipo_combustible` enum('GASOLINA_ESPECIAL','GASOLINA_PREMIUM','DIESEL_OIL','GNV') NOT NULL,
  `volumen` decimal(12,2) NOT NULL COMMENT 'Litros',
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp(),
  `documento_referencia` varchar(50) DEFAULT NULL COMMENT 'Gu?a, factura o remisi?n asociada',
  `id_usuario_registro` int(11) NOT NULL COMMENT 'Usuario que registr? el movimiento'
) ;

--
-- Volcado de datos para la tabla `inventario`
--

INSERT INTO `inventario` (`id_movimiento`, `tipo_movimiento`, `id_centro_acopio`, `id_estacion`, `id_cisterna`, `tipo_combustible`, `volumen`, `fecha_hora`, `documento_referencia`, `id_usuario_registro`) VALUES
(1, 'SALIDA', 1, NULL, 1, 'GASOLINA_ESPECIAL', 10000.00, '2026-09-26 11:28:23', 'GUIA-0001', 1),
(2, 'ENTRADA', NULL, 1, 1, 'GASOLINA_ESPECIAL', 9200.00, '2026-09-26 11:28:23', 'GUIA-0001', 1);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `registro_telemetria`
--

CREATE TABLE `registro_telemetria` (
  `id_telemetria` bigint(20) NOT NULL,
  `id_cisterna` int(11) NOT NULL,
  `fecha_hora` datetime(3) NOT NULL DEFAULT current_timestamp(3) COMMENT 'Timestamp con precisi?n de milisegundos',
  `latitud` decimal(10,7) NOT NULL,
  `longitud` decimal(10,7) NOT NULL,
  `nivel_carga` decimal(10,2) NOT NULL COMMENT 'Litros actuales en el tanque de la cisterna',
  `flujo_instantaneo` decimal(10,3) DEFAULT NULL COMMENT 'Litros/minuto, positivo=carga, negativo=descarga',
  `velocidad_kmh` decimal(6,2) DEFAULT NULL,
  `evento` enum('EN_RUTA','CARGA','DESCARGA','DETENIDO','ALERTA_MERMA') NOT NULL DEFAULT 'EN_RUTA'
) ;

--
-- Volcado de datos para la tabla `registro_telemetria`
--

INSERT INTO `registro_telemetria` (`id_telemetria`, `id_cisterna`, `fecha_hora`, `latitud`, `longitud`, `nivel_carga`, `flujo_instantaneo`, `velocidad_kmh`, `evento`) VALUES
(1, 1, '2026-09-15 08:00:00.000', -16.5000000, -68.1500000, 10000.00, 0.000, 0.00, 'CARGA'),
(2, 1, '2026-09-15 09:30:00.000', -16.5200000, -68.1400000, 9500.00, -15.500, 55.00, 'EN_RUTA'),
(3, 1, '2026-09-15 10:15:00.000', -16.5100000, -68.1300000, 9200.00, 0.000, 0.00, 'DESCARGA'),
(4, 2, '2026-09-15 08:10:00.000', -17.7833000, -63.1821000, 12000.00, 0.000, 0.00, 'CARGA'),
(5, 1, '2026-09-26 15:40:03.208', -16.5096719, -68.1303251, 9305.00, -15.500, NULL, 'EN_RUTA'),
(6, 1, '2026-09-26 15:40:06.107', -16.5102168, -68.1301977, 9290.00, -15.500, NULL, 'EN_RUTA'),
(7, 1, '2026-09-26 15:40:09.102', -16.5100374, -68.1302578, 9275.00, -15.500, NULL, 'EN_RUTA'),
(8, 1, '2026-09-26 15:40:12.102', -16.5095124, -68.1302048, 9260.00, -15.500, NULL, 'EN_RUTA'),
(9, 1, '2026-09-26 15:40:15.103', -16.5100718, -68.1299687, 9245.00, -15.500, NULL, 'EN_RUTA'),
(10, 1, '2026-09-26 15:40:18.102', -16.5096503, -68.1297961, 9230.00, -15.500, NULL, 'EN_RUTA'),
(11, 1, '2026-09-26 15:40:21.102', -16.5100401, -68.1302407, 9215.00, -15.500, NULL, 'EN_RUTA'),
(12, 1, '2026-09-26 15:40:24.101', -16.5098642, -68.1302676, 9200.00, -15.500, NULL, 'EN_RUTA'),
(13, 1, '2026-09-26 15:40:27.108', -16.5098191, -68.1301772, 9185.00, -15.500, NULL, 'EN_RUTA'),
(14, 1, '2026-09-26 15:40:30.104', -16.5103662, -68.1299470, 9170.00, -15.500, NULL, 'EN_RUTA'),
(15, 1, '2026-09-26 15:40:33.104', -16.5103148, -68.1302388, 9155.00, -15.500, NULL, 'EN_RUTA'),
(16, 1, '2026-09-26 15:40:36.107', -16.5096424, -68.1304280, 9140.00, -15.500, NULL, 'EN_RUTA'),
(17, 1, '2026-09-26 15:40:39.106', -16.5102694, -68.1304271, 9125.00, -15.500, NULL, 'EN_RUTA'),
(18, 1, '2026-09-26 15:40:42.107', -16.5099149, -68.1300515, 9110.00, -15.500, NULL, 'EN_RUTA'),
(19, 1, '2026-09-26 15:40:45.109', -16.5102917, -68.1303193, 9095.00, -15.500, NULL, 'EN_RUTA'),
(20, 1, '2026-09-26 15:40:48.123', -16.5104742, -68.1304517, 9080.00, -15.500, NULL, 'EN_RUTA'),
(21, 1, '2026-09-26 15:40:51.111', -16.5095249, -68.1303137, 9065.00, -15.500, NULL, 'EN_RUTA'),
(22, 1, '2026-09-26 15:40:54.113', -16.5095093, -68.1298648, 9050.00, -15.500, NULL, 'EN_RUTA'),
(23, 1, '2026-09-26 15:40:57.114', -16.5101809, -68.1299195, 9035.00, -15.500, NULL, 'EN_RUTA'),
(24, 1, '2026-09-26 15:41:00.114', -16.5103921, -68.1298689, 9020.00, -15.500, NULL, 'EN_RUTA'),
(25, 1, '2026-09-26 15:41:03.114', -16.5104872, -68.1296568, 9005.00, -15.500, NULL, 'EN_RUTA'),
(26, 1, '2026-09-26 15:41:06.118', -16.5101106, -68.1295636, 8990.00, -15.500, NULL, 'EN_RUTA'),
(27, 1, '2026-09-26 15:41:09.123', -16.5098953, -68.1301456, 8975.00, -15.500, NULL, 'EN_RUTA'),
(28, 1, '2026-09-26 15:41:12.124', -16.5095235, -68.1297339, 8960.00, -15.500, NULL, 'EN_RUTA'),
(29, 1, '2026-09-26 15:41:15.122', -16.5102616, -68.1302818, 8945.00, -15.500, NULL, 'EN_RUTA'),
(30, 1, '2026-09-26 15:41:18.123', -16.5098833, -68.1301246, 8930.00, -15.500, NULL, 'EN_RUTA'),
(31, 1, '2026-09-26 15:41:21.137', -16.5103480, -68.1302601, 8915.00, -15.500, NULL, 'EN_RUTA'),
(32, 1, '2026-09-26 15:41:24.132', -16.5099369, -68.1302326, 8900.00, -15.500, NULL, 'EN_RUTA'),
(33, 1, '2026-09-26 15:41:27.128', -16.5097166, -68.1295037, 8885.00, -15.500, NULL, 'EN_RUTA'),
(34, 1, '2026-09-26 15:41:30.131', -16.5102290, -68.1297371, 8870.00, -15.500, NULL, 'EN_RUTA'),
(35, 1, '2026-09-26 15:41:33.226', -16.5096984, -68.1303604, 8855.00, -15.500, NULL, 'EN_RUTA'),
(36, 1, '2026-09-26 15:41:36.196', -16.5104718, -68.1296464, 8840.00, -15.500, NULL, 'EN_RUTA'),
(37, 1, '2026-09-26 15:41:39.195', -16.5100699, -68.1300768, 8825.00, -15.500, NULL, 'EN_RUTA'),
(38, 1, '2026-09-26 15:41:42.196', -16.5100666, -68.1299493, 8810.00, -15.500, NULL, 'EN_RUTA'),
(39, 1, '2026-09-26 15:41:45.196', -16.5099372, -68.1300802, 8795.00, -15.500, NULL, 'EN_RUTA'),
(40, 1, '2026-09-26 15:41:48.193', -16.5104925, -68.1304772, 8780.00, -15.500, NULL, 'EN_RUTA'),
(41, 1, '2026-09-26 16:21:27.535', -16.5100002, -68.1299972, 10000.00, -12.000, NULL, 'EN_RUTA'),
(42, 1, '2026-09-26 16:21:32.313', -16.5102005, -68.1297988, 10000.00, -12.000, NULL, 'EN_RUTA'),
(43, 1, '2026-09-26 16:21:37.114', -16.5104007, -68.1296463, 10000.00, -12.000, NULL, 'EN_RUTA'),
(44, 1, '2026-09-26 16:24:18.767', -16.5100002, -68.1299972, 10000.00, -23.990, NULL, 'EN_RUTA'),
(45, 1, '2026-09-26 16:24:23.556', -16.5102005, -68.1297988, 10000.00, -23.990, NULL, 'EN_RUTA'),
(46, 1, '2026-09-26 16:24:28.718', -16.5104007, -68.1296463, 10000.00, -23.990, NULL, 'EN_RUTA'),
(47, 1, '2026-09-26 16:24:34.169', -16.5106506, -68.1295013, 10000.00, -23.990, NULL, 'EN_RUTA'),
(48, 1, '2026-09-26 16:24:39.197', -16.5107994, -68.1293182, 10000.00, -8.980, NULL, 'EN_RUTA'),
(49, 1, '2026-09-26 16:24:43.717', -16.5100002, -68.1299972, 10000.00, -8.980, NULL, 'EN_RUTA'),
(50, 1, '2026-09-26 16:24:48.376', -16.5102005, -68.1297988, 10000.00, -8.980, NULL, 'EN_RUTA'),
(51, 1, '2026-09-26 16:24:53.521', -16.5104007, -68.1296463, 10000.00, -14.990, NULL, 'EN_RUTA'),
(52, 1, '2026-09-26 16:24:58.102', -16.5106506, -68.1295013, 10000.00, -17.980, NULL, 'EN_RUTA'),
(53, 1, '2026-09-26 16:25:03.028', -16.5107994, -68.1293182, 10000.00, -29.980, NULL, 'EN_RUTA'),
(54, 1, '2026-09-26 16:25:07.758', -16.5100002, -68.1299972, 10000.00, -29.980, NULL, 'EN_RUTA'),
(55, 1, '2026-09-26 16:25:13.789', -16.5102005, -68.1297988, 10000.00, -29.980, NULL, 'EN_RUTA'),
(56, 1, '2026-09-26 16:25:19.026', -16.5104007, -68.1296463, 10000.00, -29.980, NULL, 'EN_RUTA'),
(57, 1, '2026-09-26 16:25:23.443', -16.5106506, -68.1295013, 10000.00, -29.980, NULL, 'EN_RUTA'),
(58, 1, '2026-09-26 16:25:28.029', -16.5107994, -68.1293182, 10000.00, -29.980, NULL, 'EN_RUTA'),
(59, 1, '2026-09-26 16:25:33.015', -16.5100002, -68.1299972, 10000.00, -29.980, NULL, 'EN_RUTA'),
(60, 1, '2026-09-26 16:25:38.508', -16.5102005, -68.1297988, 10000.00, -29.980, NULL, 'EN_RUTA'),
(61, 1, '2026-09-26 16:25:43.564', -16.5104007, -68.1296463, 10000.00, -29.980, NULL, 'EN_RUTA'),
(62, 1, '2026-09-26 16:25:48.273', -16.5106506, -68.1295013, 10000.00, -29.980, NULL, 'EN_RUTA'),
(63, 1, '2026-09-26 16:25:53.806', -16.5107994, -68.1293182, 10000.00, -29.980, NULL, 'EN_RUTA'),
(64, 1, '2026-09-26 16:25:59.103', -16.5100002, -68.1299972, 10000.00, -29.980, NULL, 'EN_RUTA'),
(65, 1, '2026-09-26 16:26:04.751', -16.5102005, -68.1297988, 10000.00, -29.980, NULL, 'EN_RUTA'),
(66, 1, '2026-09-26 16:26:10.414', -16.5104007, -68.1296463, 10000.00, -29.980, NULL, 'EN_RUTA'),
(67, 1, '2026-09-26 16:26:15.790', -16.5106506, -68.1295013, 10000.00, 0.000, NULL, 'EN_RUTA'),
(68, 1, '2026-09-26 16:26:20.834', -16.5107994, -68.1293182, 10000.00, 0.000, NULL, 'EN_RUTA'),
(69, 1, '2026-09-26 16:26:27.391', -16.5100002, -68.1299972, 10000.00, 0.000, NULL, 'EN_RUTA'),
(70, 1, '2026-09-26 16:26:33.083', -16.5102005, -68.1297988, 10000.00, 0.000, NULL, 'EN_RUTA'),
(71, 1, '2026-09-26 16:26:38.512', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(72, 1, '2026-09-26 16:26:44.284', -16.5106506, -68.1295013, 10000.00, 0.000, NULL, 'EN_RUTA'),
(73, 1, '2026-09-26 16:30:18.748', -16.5102005, -68.1297988, 10000.00, 0.000, NULL, 'EN_RUTA'),
(74, 1, '2026-09-26 16:30:24.870', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(75, 1, '2026-09-26 16:30:30.838', -16.5106506, -68.1295013, 10000.00, 0.000, NULL, 'EN_RUTA'),
(76, 1, '2026-09-26 16:30:37.620', -16.5107994, -68.1293182, 10000.00, 0.000, NULL, 'EN_RUTA'),
(77, 1, '2026-09-26 16:30:43.546', -16.5100002, -68.1299972, 10000.00, 0.000, NULL, 'EN_RUTA'),
(78, 1, '2026-09-26 16:30:49.792', -16.5102005, -68.1297988, 10000.00, 0.000, NULL, 'EN_RUTA'),
(79, 1, '2026-09-26 16:30:55.258', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(80, 1, '2026-09-26 16:31:01.276', -16.5106506, -68.1295013, 10000.00, 0.000, NULL, 'EN_RUTA'),
(81, 1, '2026-09-26 16:31:06.671', -16.5107994, -68.1293182, 10000.00, 0.000, NULL, 'EN_RUTA'),
(82, 1, '2026-09-26 16:31:13.515', -16.5100002, -68.1299972, 10000.00, 0.000, NULL, 'EN_RUTA'),
(83, 1, '2026-09-26 16:31:19.852', -16.5102005, -68.1297988, 10000.00, 0.000, NULL, 'EN_RUTA'),
(84, 1, '2026-09-26 16:31:26.756', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(85, 1, '2026-09-26 16:31:33.490', -16.5106506, -68.1295013, 10000.00, 0.000, NULL, 'EN_RUTA'),
(86, 1, '2026-09-26 16:31:38.486', -16.5107994, -68.1293182, 10000.00, 0.000, NULL, 'EN_RUTA'),
(87, 1, '2026-09-26 16:31:44.391', -16.5100002, -68.1299972, 10000.00, 0.000, NULL, 'EN_RUTA'),
(88, 1, '2026-09-26 16:31:50.403', -16.5102005, -68.1297988, 10000.00, 0.000, NULL, 'EN_RUTA'),
(89, 1, '2026-09-26 16:31:56.652', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(90, 1, '2026-09-26 16:32:01.581', -16.5106506, -68.1295013, 10000.00, 0.000, NULL, 'EN_RUTA'),
(91, 1, '2026-09-26 16:32:07.352', -16.5107994, -68.1293182, 10000.00, 0.000, NULL, 'EN_RUTA'),
(92, 1, '2026-09-26 16:32:12.927', -16.5100002, -68.1299972, 10000.00, 0.000, NULL, 'EN_RUTA'),
(93, 1, '2026-09-26 16:32:19.341', -16.5102005, -68.1297988, 10000.00, 0.000, NULL, 'EN_RUTA'),
(94, 1, '2026-09-26 16:32:24.842', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(95, 1, '2026-09-26 16:32:30.566', -16.5106506, -68.1295013, 10000.00, 0.000, NULL, 'EN_RUTA'),
(96, 1, '2026-09-26 16:32:35.485', -16.5107994, -68.1293182, 10000.00, -15.640, NULL, 'EN_RUTA'),
(97, 1, '2026-09-26 16:32:41.794', -16.5100002, -68.1299972, 10000.00, -17.980, NULL, 'EN_RUTA'),
(98, 1, '2026-09-26 16:32:47.930', -16.5102005, -68.1297988, 10000.00, -17.980, NULL, 'EN_RUTA'),
(99, 1, '2026-09-26 16:32:54.251', -16.5104007, -68.1296463, 10000.00, -17.980, NULL, 'EN_RUTA'),
(100, 1, '2026-09-26 16:33:00.967', -16.5106506, -68.1295013, 10000.00, -17.980, NULL, 'EN_RUTA'),
(101, 1, '2026-09-26 16:33:07.286', -16.5107994, -68.1293182, 10000.00, -17.980, NULL, 'EN_RUTA'),
(102, 1, '2026-09-26 16:33:13.817', -16.5100002, -68.1299972, 10000.00, -17.980, NULL, 'EN_RUTA'),
(103, 1, '2026-09-26 16:33:20.388', -16.5102005, -68.1297988, 10000.00, -17.980, NULL, 'EN_RUTA'),
(104, 1, '2026-09-26 16:33:27.287', -16.5104007, -68.1296463, 10000.00, -17.980, NULL, 'EN_RUTA'),
(105, 1, '2026-09-26 16:33:33.409', -16.5106506, -68.1295013, 10000.00, -17.980, NULL, 'EN_RUTA'),
(106, 1, '2026-09-26 16:33:39.771', -16.5107994, -68.1293182, 10000.00, -17.980, NULL, 'EN_RUTA'),
(107, 1, '2026-09-26 16:33:46.376', -16.5100002, -68.1299972, 10000.00, -17.980, NULL, 'EN_RUTA'),
(108, 1, '2026-09-26 16:33:52.378', -16.5102005, -68.1297988, 10000.00, -17.980, NULL, 'EN_RUTA'),
(109, 1, '2026-09-26 16:33:58.099', -16.5104007, -68.1296463, 10000.00, -17.980, NULL, 'EN_RUTA'),
(110, 1, '2026-09-26 16:34:03.760', -16.5106506, -68.1295013, 10000.00, -17.980, NULL, 'EN_RUTA'),
(111, 1, '2026-09-27 09:53:49.140', -16.5095607, -68.1301540, 9485.00, -15.500, NULL, 'EN_RUTA'),
(112, 1, '2026-09-27 09:53:52.045', -16.5096768, -68.1300802, 9470.00, -15.500, NULL, 'EN_RUTA'),
(113, 1, '2026-09-27 09:53:55.044', -16.5100859, -68.1300001, 9455.00, -15.500, NULL, 'EN_RUTA'),
(114, 1, '2026-09-27 09:53:58.053', -16.5095319, -68.1297279, 9440.00, -15.500, NULL, 'EN_RUTA'),
(115, 1, '2026-09-27 09:54:01.048', -16.5104524, -68.1297090, 9425.00, -15.500, NULL, 'EN_RUTA'),
(116, 1, '2026-09-27 09:54:04.046', -16.5104783, -68.1299735, 9410.00, -15.500, NULL, 'EN_RUTA'),
(117, 1, '2026-09-27 09:54:07.045', -16.5103294, -68.1303123, 9395.00, -15.500, NULL, 'EN_RUTA'),
(118, 1, '2026-09-27 09:55:37.620', -16.5100002, -68.1299972, 10000.00, -17.980, NULL, 'EN_RUTA'),
(119, 1, '2026-09-27 09:55:44.346', -16.5102005, -68.1297988, 10000.00, -17.980, NULL, 'EN_RUTA'),
(120, 1, '2026-09-27 09:55:51.130', -16.5104007, -68.1296463, 10000.00, -17.980, NULL, 'EN_RUTA'),
(121, 1, '2026-09-27 09:55:57.780', -16.5106506, -68.1295013, 10000.00, -17.980, NULL, 'EN_RUTA'),
(122, 1, '2026-09-27 09:56:04.314', -16.5107994, -68.1293182, 10000.00, -17.980, NULL, 'EN_RUTA'),
(123, 1, '2026-09-27 09:56:10.880', -16.5100002, -68.1299972, 10000.00, -17.980, NULL, 'EN_RUTA'),
(124, 1, '2026-09-27 09:56:17.518', -16.5102005, -68.1297988, 10000.00, -21.000, NULL, 'EN_RUTA'),
(125, 1, '2026-09-27 09:56:24.409', -16.5104007, -68.1296463, 10000.00, -27.010, NULL, 'EN_RUTA'),
(126, 1, '2026-09-27 09:56:31.595', -16.5106506, -68.1295013, 10000.00, -27.010, NULL, 'EN_RUTA'),
(127, 1, '2026-09-27 09:56:38.472', -16.5107994, -68.1293182, 10000.00, -27.010, NULL, 'EN_RUTA'),
(128, 1, '2026-09-27 09:56:45.460', -16.5100002, -68.1299972, 10000.00, -27.010, NULL, 'EN_RUTA'),
(129, 1, '2026-09-27 09:56:51.843', -16.5102005, -68.1297988, 10000.00, -27.010, NULL, 'EN_RUTA'),
(130, 1, '2026-09-27 09:56:58.312', -16.5104007, -68.1296463, 10000.00, -27.010, NULL, 'EN_RUTA'),
(131, 1, '2026-09-27 09:57:05.257', -16.5106506, -68.1295013, 10000.00, -27.010, NULL, 'EN_RUTA'),
(132, 1, '2026-09-27 09:57:11.789', -16.5107994, -68.1293182, 10000.00, -27.010, NULL, 'EN_RUTA'),
(133, 1, '2026-09-27 09:57:18.724', -16.5100002, -68.1299972, 10000.00, -27.010, NULL, 'EN_RUTA'),
(134, 1, '2026-09-27 09:57:25.171', -16.5102005, -68.1297988, 10000.00, -27.010, NULL, 'EN_RUTA'),
(135, 1, '2026-09-27 09:57:31.782', -16.5104007, -68.1296463, 10000.00, -27.010, NULL, 'EN_RUTA'),
(136, 1, '2026-09-27 09:57:38.283', -16.5106506, -68.1295013, 10000.00, -27.010, NULL, 'EN_RUTA'),
(137, 1, '2026-09-27 09:57:48.723', -16.5100002, -68.1299972, 10000.00, -27.010, NULL, 'EN_RUTA'),
(138, 1, '2026-09-27 09:57:52.996', -16.5102005, -68.1297988, 10000.00, -27.010, NULL, 'EN_RUTA'),
(139, 1, '2026-09-27 09:57:57.625', -16.5104007, -68.1296463, 10000.00, -27.010, NULL, 'EN_RUTA'),
(140, 1, '2026-09-27 09:58:01.879', -16.5106506, -68.1295013, 10000.00, -27.010, NULL, 'EN_RUTA'),
(141, 1, '2026-09-27 09:58:06.529', -16.5107994, -68.1293182, 10000.00, -27.010, NULL, 'EN_RUTA'),
(142, 1, '2026-09-27 09:58:11.462', -16.5100002, -68.1299972, 10000.00, -27.010, NULL, 'EN_RUTA'),
(143, 1, '2026-09-27 09:58:18.019', -16.5102005, -68.1297988, 10000.00, -27.010, NULL, 'EN_RUTA'),
(144, 1, '2026-09-27 09:58:23.870', -16.5104007, -68.1296463, 10000.00, -27.010, NULL, 'EN_RUTA'),
(145, 1, '2026-09-27 09:58:28.702', -16.5106506, -68.1295013, 10000.00, -27.010, NULL, 'EN_RUTA'),
(146, 1, '2026-09-27 09:58:34.292', -16.5107994, -68.1293182, 10000.00, -27.010, NULL, 'EN_RUTA'),
(147, 1, '2026-09-27 09:58:39.336', -16.5100002, -68.1299972, 10000.00, -27.010, NULL, 'EN_RUTA'),
(148, 1, '2026-09-27 09:58:44.573', -16.5102005, -68.1297988, 10000.00, -27.010, NULL, 'EN_RUTA'),
(149, 1, '2026-09-27 09:58:50.872', -16.5104007, -68.1296463, 10000.00, -27.010, NULL, 'EN_RUTA'),
(150, 1, '2026-09-27 09:58:58.857', -16.5106506, -68.1295013, 10000.00, -27.010, NULL, 'EN_RUTA'),
(151, 1, '2026-09-27 09:59:08.467', -16.5107994, -68.1293182, 10000.00, -27.010, NULL, 'EN_RUTA'),
(152, 1, '2026-09-27 09:59:15.243', -16.5100002, -68.1299972, 10000.00, -27.010, NULL, 'EN_RUTA'),
(153, 1, '2026-09-27 09:59:20.477', -16.5102005, -68.1297988, 10000.00, -27.010, NULL, 'EN_RUTA'),
(154, 1, '2026-09-27 09:59:25.684', -16.5104007, -68.1296463, 10000.00, -27.010, NULL, 'EN_RUTA'),
(155, 1, '2026-09-27 09:59:30.886', -16.5106506, -68.1295013, 10000.00, -27.010, NULL, 'EN_RUTA'),
(156, 1, '2026-09-27 09:59:35.957', -16.5107994, -68.1293182, 10000.00, -27.010, NULL, 'EN_RUTA'),
(157, 1, '2026-09-27 09:59:40.865', -16.5100002, -68.1299972, 10000.00, -27.010, NULL, 'EN_RUTA'),
(158, 1, '2026-09-27 09:59:47.097', -16.5102005, -68.1297988, 10000.00, -27.010, NULL, 'EN_RUTA'),
(159, 1, '2026-09-27 09:59:53.712', -16.5104007, -68.1296463, 10000.00, -27.010, NULL, 'EN_RUTA'),
(160, 1, '2026-09-27 09:59:59.091', -16.5106506, -68.1295013, 10000.00, -27.010, NULL, 'EN_RUTA'),
(161, 1, '2026-09-27 10:00:04.024', -16.5107994, -68.1293182, 10000.00, -27.010, NULL, 'EN_RUTA'),
(162, 1, '2026-09-27 10:00:09.582', -16.5100002, -68.1299972, 10000.00, -27.010, NULL, 'EN_RUTA'),
(163, 1, '2026-09-27 10:00:14.766', -16.5102005, -68.1297988, 10000.00, -27.010, NULL, 'EN_RUTA'),
(164, 1, '2026-09-27 10:00:19.779', -16.5104007, -68.1296463, 10000.00, -27.010, NULL, 'EN_RUTA'),
(165, 1, '2026-09-27 10:00:24.592', -16.5106506, -68.1295013, 10000.00, -27.010, NULL, 'EN_RUTA'),
(166, 1, '2026-09-27 10:13:03.951', -16.5100002, -68.1299972, 10000.00, -27.010, NULL, 'EN_RUTA'),
(167, 1, '2026-09-27 10:13:09.717', -16.5102005, -68.1297988, 10000.00, -27.010, NULL, 'EN_RUTA'),
(168, 1, '2026-09-27 10:13:15.425', -16.5104007, -68.1296463, 10000.00, -12.000, NULL, 'EN_RUTA'),
(169, 1, '2026-09-27 10:13:21.822', -16.5106506, -68.1295013, 10000.00, -12.000, NULL, 'EN_RUTA'),
(170, 1, '2026-09-27 10:13:28.003', -16.5107994, -68.1293182, 10000.00, -12.000, NULL, 'EN_RUTA'),
(171, 1, '2026-09-27 10:13:34.666', -16.5100002, -68.1299972, 10000.00, -12.000, NULL, 'EN_RUTA'),
(172, 1, '2026-09-27 10:13:41.861', -16.5102005, -68.1297988, 10000.00, -12.000, NULL, 'EN_RUTA'),
(173, 1, '2026-09-27 10:13:48.203', -16.5104007, -68.1296463, 10000.00, -12.000, NULL, 'EN_RUTA'),
(174, 1, '2026-09-27 10:14:08.070', -16.5100002, -68.1299972, 10000.00, 0.000, NULL, 'EN_RUTA'),
(175, 1, '2026-09-27 10:14:14.339', -16.5102005, -68.1297988, 10000.00, 0.000, NULL, 'EN_RUTA'),
(176, 1, '2026-09-27 10:14:20.408', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(177, 1, '2026-09-27 10:14:26.383', -16.5106506, -68.1295013, 10000.00, -12.000, NULL, 'EN_RUTA'),
(178, 1, '2026-09-27 10:14:32.801', -16.5107994, -68.1293182, 10000.00, -17.980, NULL, 'EN_RUTA'),
(179, 1, '2026-09-27 10:14:38.838', -16.5100002, -68.1299972, 10000.00, 0.000, NULL, 'EN_RUTA'),
(180, 1, '2026-09-27 10:14:44.550', -16.5102005, -68.1297988, 10000.00, 0.000, NULL, 'EN_RUTA'),
(181, 1, '2026-09-27 10:14:51.328', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(182, 1, '2026-09-27 10:14:57.115', -16.5106506, -68.1295013, 10000.00, 0.000, NULL, 'EN_RUTA'),
(183, 1, '2026-09-27 10:15:03.277', -16.5107994, -68.1293182, 10000.00, 0.000, NULL, 'EN_RUTA'),
(184, 1, '2026-09-27 10:15:27.914', -16.5100002, -68.1299972, 10000.00, 0.000, NULL, 'EN_RUTA'),
(185, 1, '2026-09-27 10:15:33.841', -16.5102005, -68.1297988, 10000.00, 0.000, NULL, 'EN_RUTA'),
(186, 1, '2026-09-27 10:15:39.299', -16.5104007, -68.1296463, 10000.00, -23.990, NULL, 'EN_RUTA'),
(187, 1, '2026-09-27 10:15:45.753', -16.5106506, -68.1295013, 10000.00, -23.990, NULL, 'EN_RUTA'),
(188, 1, '2026-09-27 10:15:51.931', -16.5107994, -68.1293182, 10000.00, -23.990, NULL, 'EN_RUTA'),
(189, 1, '2026-09-27 10:15:57.388', -16.5100002, -68.1299972, 10000.00, -23.990, NULL, 'EN_RUTA'),
(190, 1, '2026-09-27 10:39:44.495', -16.5100002, -68.1299972, 10000.00, -23.990, NULL, 'EN_RUTA'),
(191, 1, '2026-09-27 10:39:54.907', -16.5102005, -68.1297988, 10000.00, -23.990, NULL, 'EN_RUTA'),
(192, 1, '2026-09-27 10:40:05.775', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(193, 1, '2026-09-27 10:40:15.970', -16.5106506, -68.1295013, 10000.00, 0.000, NULL, 'EN_RUTA'),
(194, 1, '2026-09-27 10:40:26.590', -16.5107994, -68.1293182, 10000.00, 0.000, NULL, 'EN_RUTA'),
(195, 1, '2026-09-27 10:40:37.275', -16.5100002, -68.1299972, 10000.00, -29.950, NULL, 'EN_RUTA'),
(196, 1, '2026-09-27 10:40:47.144', -16.5102005, -68.1297988, 10000.00, -29.950, NULL, 'EN_RUTA'),
(197, 1, '2026-09-27 10:40:57.377', -16.5104007, -68.1296463, 10000.00, -29.950, NULL, 'EN_RUTA'),
(198, 1, '2026-09-27 10:41:07.627', -16.5106506, -68.1295013, 10000.00, -29.950, NULL, 'EN_RUTA'),
(199, 1, '2026-09-27 10:41:18.474', -16.5107994, -68.1293182, 10000.00, -29.950, NULL, 'EN_RUTA'),
(200, 1, '2026-09-27 10:41:29.842', -16.5100002, -68.1299972, 10000.00, -29.950, NULL, 'EN_RUTA'),
(201, 1, '2026-09-27 10:41:40.162', -16.5102005, -68.1297988, 10000.00, -29.950, NULL, 'EN_RUTA'),
(202, 1, '2026-09-27 10:41:50.736', -16.5104007, -68.1296463, 10000.00, -29.950, NULL, 'EN_RUTA'),
(203, 1, '2026-09-27 10:42:01.439', -16.5106506, -68.1295013, 10000.00, -29.950, NULL, 'EN_RUTA'),
(204, 1, '2026-09-27 10:42:11.484', -16.5107994, -68.1293182, 10000.00, -29.950, NULL, 'EN_RUTA'),
(205, 1, '2026-09-27 10:42:21.762', -16.5100002, -68.1299972, 10000.00, -29.950, NULL, 'EN_RUTA'),
(206, 1, '2026-09-27 10:42:32.141', -16.5102005, -68.1297988, 10000.00, -29.950, NULL, 'EN_RUTA'),
(207, 1, '2026-09-27 10:42:42.812', -16.5104007, -68.1296463, 10000.00, -29.950, NULL, 'EN_RUTA'),
(208, 1, '2026-09-27 10:42:53.449', -16.5106506, -68.1295013, 10000.00, -29.950, NULL, 'EN_RUTA'),
(209, 1, '2026-09-27 10:43:03.948', -16.5107994, -68.1293182, 10000.00, -29.950, NULL, 'EN_RUTA'),
(210, 1, '2026-09-27 10:43:14.190', -16.5100002, -68.1299972, 10000.00, -29.950, NULL, 'EN_RUTA'),
(211, 1, '2026-09-27 10:43:24.491', -16.5102005, -68.1297988, 10000.00, -29.950, NULL, 'EN_RUTA'),
(212, 1, '2026-09-27 10:43:35.105', -16.5104007, -68.1296463, 10000.00, -29.950, NULL, 'EN_RUTA'),
(213, 1, '2026-09-27 10:49:41.057', -16.5106506, -68.1295013, 10000.00, -29.950, NULL, 'EN_RUTA'),
(214, 1, '2026-09-27 10:49:51.428', -16.5107994, -68.1293182, 10000.00, -29.950, NULL, 'EN_RUTA'),
(215, 1, '2026-09-27 10:50:01.822', -16.5100002, -68.1299972, 10000.00, -29.950, NULL, 'EN_RUTA'),
(216, 1, '2026-09-27 10:50:11.862', -16.5102005, -68.1297988, 10000.00, -29.950, NULL, 'EN_RUTA'),
(217, 1, '2026-09-27 10:50:21.769', -16.5104007, -68.1296463, 10000.00, -29.950, NULL, 'EN_RUTA'),
(218, 1, '2026-09-27 10:50:31.884', -16.5106506, -68.1295013, 10000.00, -29.950, NULL, 'EN_RUTA'),
(219, 1, '2026-09-27 10:50:41.956', -16.5107994, -68.1293182, 10000.00, -29.950, NULL, 'EN_RUTA'),
(220, 1, '2026-09-27 10:50:52.286', -16.5100002, -68.1299972, 10000.00, -29.950, NULL, 'EN_RUTA'),
(221, 1, '2026-09-27 10:51:26.316', -16.5100002, -68.1299972, 10000.00, -29.950, NULL, 'EN_RUTA'),
(222, 1, '2026-09-27 10:51:36.285', -16.5102005, -68.1297988, 10000.00, -29.950, NULL, 'EN_RUTA'),
(223, 1, '2026-09-27 10:51:47.318', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(224, 1, '2026-09-27 10:51:57.195', -16.5106506, -68.1295013, 10000.00, 0.000, NULL, 'EN_RUTA'),
(225, 1, '2026-09-27 11:04:57.744', -16.5100002, -68.1299972, 9882.03, 0.000, NULL, 'EN_RUTA'),
(226, 1, '2026-09-27 11:05:06.452', -16.5102005, -68.1297988, 9882.03, 0.000, NULL, 'EN_RUTA'),
(227, 1, '2026-09-27 11:05:14.731', -16.5104007, -68.1296463, 9882.03, 0.000, NULL, 'EN_RUTA'),
(228, 1, '2026-09-27 11:11:13.485', -16.5106506, -68.1295013, 9882.03, 0.000, NULL, 'EN_RUTA'),
(229, 1, '2026-09-27 11:11:21.730', -16.5107994, -68.1293182, 9882.03, 0.000, NULL, 'EN_RUTA'),
(230, 1, '2026-09-27 11:11:30.402', -16.5100002, -68.1299972, 9882.03, 0.000, NULL, 'EN_RUTA'),
(231, 1, '2026-09-27 11:11:38.694', -16.5102005, -68.1297988, 9882.03, 0.000, NULL, 'EN_RUTA'),
(232, 1, '2026-09-27 11:11:47.289', -16.5104007, -68.1296463, 9882.03, 0.000, NULL, 'EN_RUTA'),
(233, 1, '2026-09-27 11:11:55.641', -16.5106506, -68.1295013, 9882.03, -12.000, NULL, 'EN_RUTA'),
(234, 1, '2026-09-27 11:14:53.521', -16.5100002, -68.1299972, 10000.00, -12.000, NULL, 'EN_RUTA'),
(235, 1, '2026-09-27 11:15:02.253', -16.5102005, -68.1297988, 10000.00, -12.000, NULL, 'EN_RUTA'),
(236, 1, '2026-09-27 11:15:10.432', -16.5104007, -68.1296463, 10000.00, -12.000, NULL, 'EN_RUTA'),
(237, 1, '2026-09-27 11:15:18.536', -16.5106506, -68.1295013, 10000.00, -12.000, NULL, 'EN_RUTA'),
(238, 1, '2026-09-27 11:15:26.784', -16.5107994, -68.1293182, 0.00, -12.000, NULL, 'EN_RUTA'),
(239, 1, '2026-09-27 11:15:35.194', -16.5100002, -68.1299972, 0.00, -12.000, NULL, 'EN_RUTA'),
(240, 1, '2026-09-27 11:28:21.777', -16.5100002, -68.1299972, 0.00, -12.000, NULL, ''),
(241, 1, '2026-09-27 11:28:30.097', -16.5102005, -68.1297988, 0.00, -12.000, NULL, ''),
(242, 1, '2026-09-27 11:28:39.031', -16.5104007, -68.1296463, 0.00, -12.000, NULL, ''),
(243, 1, '2026-09-27 11:28:55.709', -16.5100002, -68.1299972, 0.00, -12.000, NULL, ''),
(244, 1, '2026-09-27 11:29:04.431', -16.5102005, -68.1297988, 0.00, -12.000, NULL, ''),
(245, 1, '2026-09-27 11:29:13.062', -16.5104007, -68.1296463, 0.00, -12.000, NULL, ''),
(246, 1, '2026-09-27 11:29:21.652', -16.5106506, -68.1295013, 0.00, -12.000, NULL, ''),
(247, 1, '2026-09-27 11:29:29.918', -16.5107994, -68.1293182, 0.00, -12.000, NULL, ''),
(248, 1, '2026-09-27 11:29:38.638', -16.5100002, -68.1299972, 0.00, 0.000, NULL, ''),
(249, 1, '2026-09-27 11:29:46.713', -16.5102005, -68.1297988, 0.00, 0.000, NULL, ''),
(250, 1, '2026-09-27 11:29:55.296', -16.5104007, -68.1296463, 0.00, -17.980, NULL, ''),
(251, 1, '2026-09-27 11:30:03.845', -16.5106506, -68.1295013, 0.00, -17.980, NULL, ''),
(252, 1, '2026-09-27 11:30:12.245', -16.5107994, -68.1293182, 0.00, -17.980, NULL, ''),
(253, 1, '2026-09-27 11:30:21.303', -16.5100002, -68.1299972, 10000.00, 0.000, NULL, 'EN_RUTA'),
(254, 1, '2026-09-27 11:30:29.238', -16.5102005, -68.1297988, 10000.00, 0.000, NULL, 'EN_RUTA'),
(255, 1, '2026-09-27 11:30:37.658', -16.5104007, -68.1296463, 10000.00, -29.950, NULL, ''),
(256, 1, '2026-09-27 11:30:44.820', -16.5106506, -68.1295013, 10000.00, -29.950, NULL, ''),
(257, 1, '2026-09-27 11:30:52.690', -16.5107994, -68.1293182, 10000.00, -29.950, NULL, ''),
(258, 1, '2026-09-27 11:32:27.652', -16.5100002, -68.1299972, 10000.00, -17.980, NULL, 'EN_RUTA'),
(259, 1, '2026-09-27 11:32:35.669', -16.5102005, -68.1297988, 10000.00, -17.980, NULL, 'EN_RUTA'),
(260, 1, '2026-09-27 11:32:43.656', -16.5104007, -68.1296463, 0.00, -17.980, NULL, ''),
(261, 1, '2026-09-27 11:32:52.550', -16.5106506, -68.1295013, 0.00, -17.980, NULL, ''),
(262, 1, '2026-09-27 11:33:01.357', -16.5107994, -68.1293182, 0.00, 0.000, NULL, ''),
(263, 1, '2026-09-27 11:33:09.802', -16.5100002, -68.1299972, 0.00, 0.000, NULL, ''),
(264, 1, '2026-09-27 11:33:17.752', -16.5102005, -68.1297988, 0.00, 0.000, NULL, ''),
(265, 1, '2026-09-27 11:33:26.244', -16.5104007, -68.1296463, 10000.00, 0.000, NULL, 'EN_RUTA'),
(266, 1, '2026-09-27 11:33:35.153', -16.5106506, -68.1295013, 0.00, 0.000, NULL, ''),
(267, 1, '2026-09-27 11:33:44.026', -16.5107994, -68.1293182, 10000.00, -29.950, NULL, '');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `roles`
--

CREATE TABLE `roles` (
  `id_rol` int(11) NOT NULL,
  `nombre_rol` varchar(50) NOT NULL COMMENT 'Ej: OPERADOR_YPFB, FISCAL_ANH, ADMIN_RED, OPERADOR_ESTACION',
  `descripcion` varchar(255) DEFAULT NULL,
  `nivel_acceso` tinyint(4) NOT NULL DEFAULT 1 COMMENT '1=b?sico, 5=administrador total',
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp()
) ;

--
-- Volcado de datos para la tabla `roles`
--

INSERT INTO `roles` (`id_rol`, `nombre_rol`, `descripcion`, `nivel_acceso`, `fecha_creacion`) VALUES
(1, 'OPERADOR_YPFB', 'Operador de centro de acopio y monitoreo de cisternas de YPFB', 3, '2026-09-26 15:28:23'),
(2, 'FISCAL_ANH', 'Fiscalizador/auditor de la Agencia Nacional de Hidrocarburos', 4, '2026-09-26 15:28:23'),
(3, 'ADMIN_RED', 'Administrador de infraestructura de red y seguridad', 5, '2026-09-26 15:28:23'),
(4, 'OPERADOR_ESTACION', 'Personal de venta en estaci?n de servicio', 2, '2026-09-26 15:28:23');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `surtidores`
--

CREATE TABLE `surtidores` (
  `id_surtidor` int(11) NOT NULL,
  `id_estacion` int(11) NOT NULL,
  `numero_surtidor` varchar(10) NOT NULL,
  `tipo_combustible` enum('GASOLINA_ESPECIAL','GASOLINA_PREMIUM','DIESEL_OIL','GNV') NOT NULL,
  `tiene_ocr` tinyint(1) NOT NULL DEFAULT 1,
  `tiene_rfid` tinyint(1) NOT NULL DEFAULT 1,
  `estado` enum('OPERATIVO','MANTENIMIENTO','FUERA_DE_SERVICIO') NOT NULL DEFAULT 'OPERATIVO'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Surtidores individuales dentro de cada estaci?n de servicio';

--
-- Volcado de datos para la tabla `surtidores`
--

INSERT INTO `surtidores` (`id_surtidor`, `id_estacion`, `numero_surtidor`, `tipo_combustible`, `tiene_ocr`, `tiene_rfid`, `estado`) VALUES
(1, 1, 'S1', 'GASOLINA_ESPECIAL', 1, 1, 'OPERATIVO'),
(2, 1, 'S2', 'DIESEL_OIL', 1, 1, 'OPERATIVO'),
(3, 2, 'S1', 'GASOLINA_ESPECIAL', 1, 1, 'OPERATIVO');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id_usuario` int(11) NOT NULL,
  `nombre_usuario` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL COMMENT 'Hash bcrypt/argon2, nunca texto plano',
  `nombre_completo` varchar(150) NOT NULL,
  `correo` varchar(150) DEFAULT NULL,
  `institucion` enum('YPFB','ANH','ESTACION_SERVICIO','ADMIN_SISTEMA') NOT NULL,
  `id_rol` int(11) NOT NULL,
  `estado` enum('ACTIVO','INACTIVO','SUSPENDIDO') NOT NULL DEFAULT 'ACTIVO',
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `ultimo_acceso` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Cuentas de personal operativo e institucional';

--
-- Volcado de datos para la tabla `usuarios`
--

INSERT INTO `usuarios` (`id_usuario`, `nombre_usuario`, `password_hash`, `nombre_completo`, `correo`, `institucion`, `id_rol`, `estado`, `fecha_creacion`, `ultimo_acceso`) VALUES
(1, 'jvargas.ypfb', '$2y$10$examplehashbcrypt0000000000000000000000000000000001', 'Jaziel Armando Vargas Choque', 'jvargas@ypfb.gob.bo', 'YPFB', 1, 'ACTIVO', '2026-09-26 15:28:23', NULL),
(2, 'rlovera.anh', '$2y$10$examplehashbcrypt0000000000000000000000000000000002', 'Rafael Ignacio Lovera Arancibia', 'rlovera@anh.gob.bo', 'ANH', 2, 'ACTIVO', '2026-09-26 15:28:23', NULL),
(3, 'aochoa.admin', '$2y$10$examplehashbcrypt0000000000000000000000000000000003', 'Ariel Didier Ochoa Salazar', 'aochoa@sistema.bo', 'ADMIN_SISTEMA', 3, 'ACTIVO', '2026-09-26 15:28:23', NULL),
(4, 'chuanca.est', '$2y$10$examplehashbcrypt0000000000000000000000000000000004', 'Cristhian Nelson Huanca Flores', 'chuanca@estacion.bo', 'ESTACION_SERVICIO', 4, 'ACTIVO', '2026-09-26 15:28:23', NULL),
(5, 'mrodriguez.anh', '$2b$10$R.Ft2MnzqGrM47w/rwUlWui1jiqYbQXYwW1Kf0WAGzGkmoMQIXmqe', 'Mariana Rodríguez Peña', 'mrodriguez@anh.gob.bo', 'ANH', 2, 'ACTIVO', '2026-09-26 18:32:37', '2026-09-26 14:44:54');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `vehiculos`
--

CREATE TABLE `vehiculos` (
  `id_vehiculo` int(11) NOT NULL,
  `placa` varchar(15) NOT NULL COMMENT 'Usada para reconocimiento OCR',
  `rfid_tag` varchar(50) NOT NULL COMMENT 'Identificador ?nico del tag RFID',
  `tipo_vehiculo` enum('LIVIANO','PESADO','MOTOCICLETA','TRANSPORTE_PUBLICO','CISTERNA') NOT NULL DEFAULT 'LIVIANO',
  `capacidad_tanque` decimal(8,2) NOT NULL COMMENT 'Litros',
  `id_conductor` int(11) NOT NULL,
  `fecha_registro` timestamp NOT NULL DEFAULT current_timestamp(),
  `estado` enum('ACTIVO','BLOQUEADO','INACTIVO') NOT NULL DEFAULT 'ACTIVO'
) ;

--
-- Volcado de datos para la tabla `vehiculos`
--

INSERT INTO `vehiculos` (`id_vehiculo`, `placa`, `rfid_tag`, `tipo_vehiculo`, `capacidad_tanque`, `id_conductor`, `fecha_registro`, `estado`) VALUES
(1, '1234-ABC', 'RFID-0001-VEH', 'LIVIANO', 45.00, 1, '2026-09-26 15:28:23', 'ACTIVO'),
(2, '5678-XYZ', 'RFID-0002-VEH', 'TRANSPORTE_PUBLICO', 60.00, 2, '2026-09-26 15:28:23', 'ACTIVO'),
(3, '9012-JKL', 'RFID-0003-VEH', 'PESADO', 150.00, 3, '2026-09-26 15:28:23', 'ACTIVO');

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `vw_alertas_activas`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `vw_alertas_activas` (
`id_alerta` bigint(20)
,`tipo_alerta` enum('MERMA_IRREGULAR','DESVIO_RUTA','TIEMPO_MUERTO','DISCREPANCIA_VOLUMEN','CUPO_EXCEDIDO','CREDENCIAL_DUPLICADA','ACCESO_NO_AUTORIZADO')
,`severidad` enum('BAJA','MEDIA','ALTA','CRITICA')
,`descripcion` varchar(500)
,`fecha_hora` datetime
,`placa_cisterna` varchar(15)
,`placa_vehiculo` varchar(15)
,`estacion` varchar(150)
,`estado` enum('ABIERTA','EN_REVISION','RESUELTA','DESCARTADA')
);

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `vw_consumo_cupos`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `vw_consumo_cupos` (
`id_cupo` int(11)
,`placa` varchar(15)
,`rfid_tag` varchar(50)
,`conductor` varchar(150)
,`periodo` enum('SEMANAL','QUINCENAL','MENSUAL')
,`volumen_autorizado` decimal(10,2)
,`volumen_consumido` decimal(10,2)
,`volumen_restante` decimal(11,2)
,`porcentaje_consumido` decimal(16,2)
,`fecha_inicio` date
,`fecha_fin` date
,`estado` enum('VIGENTE','AGOTADO','SUSPENDIDO','VENCIDO')
);

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `vw_despachos_detalle`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `vw_despachos_detalle` (
`id_despacho` bigint(20)
,`fecha_hora` datetime
,`estacion` varchar(150)
,`numero_surtidor` varchar(10)
,`placa` varchar(15)
,`conductor` varchar(150)
,`volumen_despachado` decimal(8,2)
,`metodo_identificacion` enum('RFID','OCR','MANUAL')
,`estado_transaccion` enum('AUTORIZADO','DENEGADO','ANULADO')
,`operador` varchar(150)
);

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `vw_estado_actual_cisternas`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `vw_estado_actual_cisternas` (
`id_cisterna` int(11)
,`placa` varchar(15)
,`fecha_hora` datetime(3)
,`latitud` decimal(10,7)
,`longitud` decimal(10,7)
,`nivel_carga` decimal(10,2)
,`flujo_instantaneo` decimal(10,3)
,`evento` enum('EN_RUTA','CARGA','DESCARGA','DETENIDO','ALERTA_MERMA')
);

-- --------------------------------------------------------

--
-- Estructura para la vista `vw_alertas_activas`
--
DROP TABLE IF EXISTS `vw_alertas_activas`;

CREATE ALGORITHM=UNDEFINED DEFINER=`` SQL SECURITY DEFINER VIEW `vw_alertas_activas`  AS SELECT `a`.`id_alerta` AS `id_alerta`, `a`.`tipo_alerta` AS `tipo_alerta`, `a`.`severidad` AS `severidad`, `a`.`descripcion` AS `descripcion`, `a`.`fecha_hora` AS `fecha_hora`, `c`.`placa` AS `placa_cisterna`, `v`.`placa` AS `placa_vehiculo`, `es`.`nombre` AS `estacion`, `a`.`estado` AS `estado` FROM (((`alertas` `a` left join `cisternas` `c` on(`c`.`id_cisterna` = `a`.`id_cisterna`)) left join `vehiculos` `v` on(`v`.`id_vehiculo` = `a`.`id_vehiculo`)) left join `estaciones_servicio` `es` on(`es`.`id_estacion` = `a`.`id_estacion`)) WHERE `a`.`estado` in ('ABIERTA','EN_REVISION') ORDER BY field(`a`.`severidad`,'CRITICA','ALTA','MEDIA','BAJA') ASC, `a`.`fecha_hora` DESC ;

-- --------------------------------------------------------

--
-- Estructura para la vista `vw_consumo_cupos`
--
DROP TABLE IF EXISTS `vw_consumo_cupos`;

CREATE ALGORITHM=UNDEFINED DEFINER=`` SQL SECURITY DEFINER VIEW `vw_consumo_cupos`  AS SELECT `c`.`id_cupo` AS `id_cupo`, `v`.`placa` AS `placa`, `v`.`rfid_tag` AS `rfid_tag`, `cd`.`nombre_completo` AS `conductor`, `c`.`periodo` AS `periodo`, `c`.`volumen_autorizado` AS `volumen_autorizado`, `c`.`volumen_consumido` AS `volumen_consumido`, `c`.`volumen_autorizado`- `c`.`volumen_consumido` AS `volumen_restante`, round(`c`.`volumen_consumido` / `c`.`volumen_autorizado` * 100,2) AS `porcentaje_consumido`, `c`.`fecha_inicio` AS `fecha_inicio`, `c`.`fecha_fin` AS `fecha_fin`, `c`.`estado` AS `estado` FROM ((`cupos` `c` join `vehiculos` `v` on(`v`.`id_vehiculo` = `c`.`id_vehiculo`)) join `conductores` `cd` on(`cd`.`id_conductor` = `v`.`id_conductor`)) ;

-- --------------------------------------------------------

--
-- Estructura para la vista `vw_despachos_detalle`
--
DROP TABLE IF EXISTS `vw_despachos_detalle`;

CREATE ALGORITHM=UNDEFINED DEFINER=`` SQL SECURITY DEFINER VIEW `vw_despachos_detalle`  AS SELECT `d`.`id_despacho` AS `id_despacho`, `d`.`fecha_hora` AS `fecha_hora`, `es`.`nombre` AS `estacion`, `s`.`numero_surtidor` AS `numero_surtidor`, `v`.`placa` AS `placa`, `cd`.`nombre_completo` AS `conductor`, `d`.`volumen_despachado` AS `volumen_despachado`, `d`.`metodo_identificacion` AS `metodo_identificacion`, `d`.`estado_transaccion` AS `estado_transaccion`, `u`.`nombre_completo` AS `operador` FROM (((((`despachos` `d` join `surtidores` `s` on(`s`.`id_surtidor` = `d`.`id_surtidor`)) join `estaciones_servicio` `es` on(`es`.`id_estacion` = `s`.`id_estacion`)) join `vehiculos` `v` on(`v`.`id_vehiculo` = `d`.`id_vehiculo`)) join `conductores` `cd` on(`cd`.`id_conductor` = `d`.`id_conductor`)) join `usuarios` `u` on(`u`.`id_usuario` = `d`.`id_usuario_operador`)) ;

-- --------------------------------------------------------

--
-- Estructura para la vista `vw_estado_actual_cisternas`
--
DROP TABLE IF EXISTS `vw_estado_actual_cisternas`;

CREATE ALGORITHM=UNDEFINED DEFINER=`` SQL SECURITY DEFINER VIEW `vw_estado_actual_cisternas`  AS SELECT `rt`.`id_cisterna` AS `id_cisterna`, `c`.`placa` AS `placa`, `rt`.`fecha_hora` AS `fecha_hora`, `rt`.`latitud` AS `latitud`, `rt`.`longitud` AS `longitud`, `rt`.`nivel_carga` AS `nivel_carga`, `rt`.`flujo_instantaneo` AS `flujo_instantaneo`, `rt`.`evento` AS `evento` FROM (`registro_telemetria` `rt` join `cisternas` `c` on(`c`.`id_cisterna` = `rt`.`id_cisterna`)) WHERE `rt`.`id_telemetria` in (select max(`registro_telemetria`.`id_telemetria`) from `registro_telemetria` group by `registro_telemetria`.`id_cisterna`) ;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `alertas`
--
ALTER TABLE `alertas`
  ADD PRIMARY KEY (`id_alerta`),
  ADD KEY `fk_alertas_cisterna` (`id_cisterna`),
  ADD KEY `fk_alertas_vehiculo` (`id_vehiculo`),
  ADD KEY `fk_alertas_estacion` (`id_estacion`),
  ADD KEY `fk_alertas_usuario` (`id_usuario_resolucion`),
  ADD KEY `idx_alertas_estado_severidad` (`estado`,`severidad`);

--
-- Indices de la tabla `centros_acopio`
--
ALTER TABLE `centros_acopio`
  ADD PRIMARY KEY (`id_centro`);

--
-- Indices de la tabla `cisternas`
--
ALTER TABLE `cisternas`
  ADD PRIMARY KEY (`id_cisterna`),
  ADD UNIQUE KEY `placa` (`placa`),
  ADD UNIQUE KEY `rfid_tag` (`rfid_tag`),
  ADD UNIQUE KEY `sensor_iot_id` (`sensor_iot_id`);

--
-- Indices de la tabla `conductores`
--
ALTER TABLE `conductores`
  ADD PRIMARY KEY (`id_conductor`),
  ADD UNIQUE KEY `ci_hash` (`ci_hash`);

--
-- Indices de la tabla `cupos`
--
ALTER TABLE `cupos`
  ADD PRIMARY KEY (`id_cupo`),
  ADD KEY `fk_cupos_vehiculo` (`id_vehiculo`);

--
-- Indices de la tabla `despachos`
--
ALTER TABLE `despachos`
  ADD PRIMARY KEY (`id_despacho`),
  ADD KEY `fk_despachos_cupo` (`id_cupo`),
  ADD KEY `fk_despachos_conductor` (`id_conductor`),
  ADD KEY `fk_despachos_usuario` (`id_usuario_operador`),
  ADD KEY `idx_despachos_vehiculo_fecha` (`id_vehiculo`,`fecha_hora`),
  ADD KEY `idx_despachos_surtidor_fecha` (`id_surtidor`,`fecha_hora`);

--
-- Indices de la tabla `estaciones_servicio`
--
ALTER TABLE `estaciones_servicio`
  ADD PRIMARY KEY (`id_estacion`),
  ADD UNIQUE KEY `codigo_ypfb` (`codigo_ypfb`);

--
-- Indices de la tabla `inventario`
--
ALTER TABLE `inventario`
  ADD PRIMARY KEY (`id_movimiento`),
  ADD KEY `fk_inventario_centro` (`id_centro_acopio`),
  ADD KEY `fk_inventario_estacion` (`id_estacion`),
  ADD KEY `fk_inventario_cisterna` (`id_cisterna`),
  ADD KEY `fk_inventario_usuario` (`id_usuario_registro`);

--
-- Indices de la tabla `registro_telemetria`
--
ALTER TABLE `registro_telemetria`
  ADD PRIMARY KEY (`id_telemetria`),
  ADD KEY `idx_telemetria_cisterna_fecha` (`id_cisterna`,`fecha_hora`);

--
-- Indices de la tabla `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id_rol`),
  ADD UNIQUE KEY `nombre_rol` (`nombre_rol`);

--
-- Indices de la tabla `surtidores`
--
ALTER TABLE `surtidores`
  ADD PRIMARY KEY (`id_surtidor`),
  ADD UNIQUE KEY `uq_surtidor_por_estacion` (`id_estacion`,`numero_surtidor`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id_usuario`),
  ADD UNIQUE KEY `nombre_usuario` (`nombre_usuario`),
  ADD UNIQUE KEY `correo` (`correo`),
  ADD KEY `fk_usuarios_rol` (`id_rol`);

--
-- Indices de la tabla `vehiculos`
--
ALTER TABLE `vehiculos`
  ADD PRIMARY KEY (`id_vehiculo`),
  ADD UNIQUE KEY `placa` (`placa`),
  ADD UNIQUE KEY `rfid_tag` (`rfid_tag`),
  ADD KEY `fk_vehiculos_conductor` (`id_conductor`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `alertas`
--
ALTER TABLE `alertas`
  MODIFY `id_alerta` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `centros_acopio`
--
ALTER TABLE `centros_acopio`
  MODIFY `id_centro` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cisternas`
--
ALTER TABLE `cisternas`
  MODIFY `id_cisterna` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `conductores`
--
ALTER TABLE `conductores`
  MODIFY `id_conductor` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `cupos`
--
ALTER TABLE `cupos`
  MODIFY `id_cupo` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `despachos`
--
ALTER TABLE `despachos`
  MODIFY `id_despacho` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `estaciones_servicio`
--
ALTER TABLE `estaciones_servicio`
  MODIFY `id_estacion` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT de la tabla `inventario`
--
ALTER TABLE `inventario`
  MODIFY `id_movimiento` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `registro_telemetria`
--
ALTER TABLE `registro_telemetria`
  MODIFY `id_telemetria` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `roles`
--
ALTER TABLE `roles`
  MODIFY `id_rol` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `surtidores`
--
ALTER TABLE `surtidores`
  MODIFY `id_surtidor` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id_usuario` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT de la tabla `vehiculos`
--
ALTER TABLE `vehiculos`
  MODIFY `id_vehiculo` int(11) NOT NULL AUTO_INCREMENT;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `alertas`
--
ALTER TABLE `alertas`
  ADD CONSTRAINT `fk_alertas_cisterna` FOREIGN KEY (`id_cisterna`) REFERENCES `cisternas` (`id_cisterna`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_alertas_estacion` FOREIGN KEY (`id_estacion`) REFERENCES `estaciones_servicio` (`id_estacion`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_alertas_usuario` FOREIGN KEY (`id_usuario_resolucion`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_alertas_vehiculo` FOREIGN KEY (`id_vehiculo`) REFERENCES `vehiculos` (`id_vehiculo`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Filtros para la tabla `cupos`
--
ALTER TABLE `cupos`
  ADD CONSTRAINT `fk_cupos_vehiculo` FOREIGN KEY (`id_vehiculo`) REFERENCES `vehiculos` (`id_vehiculo`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `despachos`
--
ALTER TABLE `despachos`
  ADD CONSTRAINT `fk_despachos_conductor` FOREIGN KEY (`id_conductor`) REFERENCES `conductores` (`id_conductor`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_despachos_cupo` FOREIGN KEY (`id_cupo`) REFERENCES `cupos` (`id_cupo`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_despachos_surtidor` FOREIGN KEY (`id_surtidor`) REFERENCES `surtidores` (`id_surtidor`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_despachos_usuario` FOREIGN KEY (`id_usuario_operador`) REFERENCES `usuarios` (`id_usuario`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_despachos_vehiculo` FOREIGN KEY (`id_vehiculo`) REFERENCES `vehiculos` (`id_vehiculo`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `inventario`
--
ALTER TABLE `inventario`
  ADD CONSTRAINT `fk_inventario_centro` FOREIGN KEY (`id_centro_acopio`) REFERENCES `centros_acopio` (`id_centro`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_inventario_cisterna` FOREIGN KEY (`id_cisterna`) REFERENCES `cisternas` (`id_cisterna`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_inventario_estacion` FOREIGN KEY (`id_estacion`) REFERENCES `estaciones_servicio` (`id_estacion`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_inventario_usuario` FOREIGN KEY (`id_usuario_registro`) REFERENCES `usuarios` (`id_usuario`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `registro_telemetria`
--
ALTER TABLE `registro_telemetria`
  ADD CONSTRAINT `fk_telemetria_cisterna` FOREIGN KEY (`id_cisterna`) REFERENCES `cisternas` (`id_cisterna`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `surtidores`
--
ALTER TABLE `surtidores`
  ADD CONSTRAINT `fk_surtidores_estacion` FOREIGN KEY (`id_estacion`) REFERENCES `estaciones_servicio` (`id_estacion`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD CONSTRAINT `fk_usuarios_rol` FOREIGN KEY (`id_rol`) REFERENCES `roles` (`id_rol`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `vehiculos`
--
ALTER TABLE `vehiculos`
  ADD CONSTRAINT `fk_vehiculos_conductor` FOREIGN KEY (`id_conductor`) REFERENCES `conductores` (`id_conductor`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
