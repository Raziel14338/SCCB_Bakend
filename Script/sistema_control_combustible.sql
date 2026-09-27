-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 26-09-2026 a las 21:54:36
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
(40, 1, '2026-09-26 15:41:48.193', -16.5104925, -68.1304772, 8780.00, -15.500, NULL, 'EN_RUTA');

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `registro_telemetria`
--
ALTER TABLE `registro_telemetria`
  ADD PRIMARY KEY (`id_telemetria`),
  ADD KEY `idx_telemetria_cisterna_fecha` (`id_cisterna`,`fecha_hora`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `registro_telemetria`
--
ALTER TABLE `registro_telemetria`
  MODIFY `id_telemetria` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `registro_telemetria`
--
ALTER TABLE `registro_telemetria`
  ADD CONSTRAINT `fk_telemetria_cisterna` FOREIGN KEY (`id_cisterna`) REFERENCES `cisternas` (`id_cisterna`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
