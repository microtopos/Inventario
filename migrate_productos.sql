-- Migration script for Productos module from Excel
-- Generated on 2026-03-24T10:17:31.512Z

-- Department: DESARROLLO
INSERT OR IGNORE INTO departamentos_prod (nombre) VALUES ('DESARROLLO');

-- Categories
INSERT OR IGNORE INTO categorias_producto (nombre) VALUES ('BOLSAS EN GENERAL');
INSERT OR IGNORE INTO categorias_producto (nombre) VALUES ('CELULOSA EN GENERAL');
INSERT OR IGNORE INTO categorias_producto (nombre) VALUES ('QUIMICOS EN GENERAL');
INSERT OR IGNORE INTO categorias_producto (nombre) VALUES ('UTILES LIMPIEZA');

-- Products
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BB005',
  'BOLSAS 115 X150 NEGRO R-10',
  (SELECT id FROM categorias_producto WHERE nombre = 'BOLSAS EN GENERAL'),
  'caja de 20 rollos',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BB217',
  'BOLSAS  52 X 60',
  (SELECT id FROM categorias_producto WHERE nombre = 'BOLSAS EN GENERAL'),
  'caja de 60 rollos',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BB369',
  'BOLSAS 85 X105',
  (SELECT id FROM categorias_producto WHERE nombre = 'BOLSAS EN GENERAL'),
  'caja de 40 rollos',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CE 711',
  'PAPEL HIGIENICO INDUSTRIAL',
  (SELECT id FROM categorias_producto WHERE nombre = 'CELULOSA EN GENERAL'),
  'fardo',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CE 471',
  'PAEL HIGIENICO DOMESTICO',
  (SELECT id FROM categorias_producto WHERE nombre = 'CELULOSA EN GENERAL'),
  'fardo',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CE 771',
  'BOBINA SECAMANOS',
  (SELECT id FROM categorias_producto WHERE nombre = 'CELULOSA EN GENERAL'),
  'fardo',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CO 205',
  'SUPERA DESENGRASANTE  GARRAFA 5L',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 4 garrafa',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'JM 080',
  'SUPERA GEL DE MANOS  GARRAFA 5L',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 4 garrafa',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'JA117',
  'GEL HIDROALCOLICO  GARRAFA 5L',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 4 garrafa',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'LI335',
  'G3 QUITATINTAS  750 ML',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 12 garrafa',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'LI320',
  'LIMPIADOR NEUTRO PERFUMADO GARRAF  5L',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 4 garrafa',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'LI 425',
  'LIMPIADOR AMONIACAL GARRAFA 5L',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 4 garrafa',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'OQ 014',
  'LEJIA CON DETERGENTE LA TUNA 2L',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 6 botella',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'OQ 005',
  'AMONIACO PERFUMADO LOS NIETOS 1L',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 15 botella',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'TS079',
  'LIMPIADOR MADERA KLIDER GARRAFA 5 L',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 4 garrafa',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AM48',
  'G3 AMBIENTADOR  LW GARRAFA 5L',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 4 garrafa',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AM094',
  'SUPERA AMBIENTADOR FLORAL  GARRAFA  5L',
  (SELECT id FROM categorias_producto WHERE nombre = 'QUIMICOS EN GENERAL'),
  'caja 4 garrafa',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AB137',
  'SALVAUÑAS INDUSTRIAL QALITA',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'paquete 8 ud',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AB136',
  'ROLLO FIBRA VERDE EXTRA 6 M',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'rollo',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AB139',
  'ACERO INOX ST 40 GR',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'paquete 10 ud',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AC016',
  'HARAGAN 55CM  REFORZADO',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidad',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AC019',
  'RAQUQETA LIMPIACRISTALES 45 CM',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidad',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AC032',
  'GGUIA TELESCOPICA 3M',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidad',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AC035',
  'LABIO DE GOMA CRISTALE 45 CM',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidad',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AC077',
  'RACASCADOR  CRISTALES 4 CM',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidad',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BP 039',
  'BAYETA MICROFIBRA VARIOS COLORES',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'paquete 12 ud',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BF169',
  'BAYETA MICROFIBRA CRISTALES',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BR002',
  'GASAS MOPA QALITA  100X82',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'paquete 25 ud',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BR013',
  'BASTIDOR MOPA CLEVER  45 CM',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BR 014',
  'BASTIDOR MOPA CLEVER 75 CM',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BRO17',
  'BASTIDOR MOPA  CLEVER 100 CM',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BR 033',
  'RECAMBIO MOPA ALGODÓN 45 CM',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'BR035',
  'RECAMBIO MOPA ALGODÓN 75 CM',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CBOO1',
  'RECOGEDOR CON MANGO QALITA',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CB245',
  'RECOGEDOR CON MANGO QALITA  GOMA',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CBOO5',
  'CUBO + ESCURRIDOR 15 L',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CBOO9',
  'CUBO CRISTALERO  8 L',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CDOO2',
  'PLUMERO MULTICOLOR',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CP014',
  'PALO ALUMINIO 1,50',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CP047',
  'PALO TITANIO CON TALADRO 1,40',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CP029',
  'CEPILLO QALITA MOQUETA GM',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'CP026',
  'CEPILLO QUIMETA BARRER',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'FR019',
  'FREGONA INDUSTRIAL',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'FR028',
  'FREGONA MICROBIBRA AZUL / BLANCA',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'FR037',
  'FREGONA ALGODÓN DOMESTICCA',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'GU 144',
  'GUANTES SATINADO PROFIT VARIAS TALLAS',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'paquete 12 pares',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'GU 103',
  'GUANTE NITRILO SENSITIVE VARIAS TALLAS',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'caja 10 paquete',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'WC',
  'ESCOBILLAS WC',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'TS084',
  'SPRAY PARA  MOPAS',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'caja 6 unidades',
  1
);
INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (
  'AP 127',
  'BOTELLA PULVERIZADOR',
  (SELECT id FROM categorias_producto WHERE nombre = 'UTILES LIMPIEZA'),
  'unidades',
  1
);

-- Movements (salidas_productos)
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'BB217'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  4,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'BB217'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  6,
  2,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'BB369'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  6,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'BB369'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  2,
  2,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'CE 711'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'CE 471'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'CE 771'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  2,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'JM 080'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'LI 425'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'OQ 014'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  2,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'OQ 014'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  2,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'AC077'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  2,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'BP 039'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  4,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'BP 039'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  3,
  2,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'BR002'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  3,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'CBOO9'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'CDOO2'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  2,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'CP026'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'FR028'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  3,
  2,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'FR037'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  3,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'GU 103'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'GU 103'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  2,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'WC'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  3,
  1,
  2025
);
INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (
  (SELECT id FROM productos_almacen WHERE referencia = 'TS084'),
  (SELECT id FROM departamentos_prod WHERE nombre = 'DESARROLLO'),
  1,
  2,
  2025
);

-- Migration completed.
