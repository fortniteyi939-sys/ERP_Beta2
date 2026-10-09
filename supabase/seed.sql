-- =============================================================================
-- ERP EnterpriseCloud · Datos de ejemplo (OPCIONAL)
-- Ejecutar DESPUÉS de la migración. Carga los mismos registros de demostración
-- que traía la maqueta para que el panel no aparezca vacío. Se puede omitir.
-- Es re-ejecutable: no duplica registros (usa el código como llave).
-- =============================================================================

insert into public.categorias (nombre, descripcion) values
  ('Tecnología', 'Equipos y periféricos'),
  ('Accesorios', 'Accesorios y conectividad')
on conflict (nombre) do nothing;

insert into public.almacenes (nombre, ubicacion, responsable) values
  ('Almacén central', 'Lima', 'Carlos Méndez'),
  ('Almacén norte',   'Trujillo', null)
on conflict (nombre) do nothing;

-- Clientes
insert into public.clientes (codigo, razon_social, detalle, linea_credito, estado, created_at) values
  ('CLI-001', 'Distribuidora Norte S.A.C.', 'ventas@norte.pe · Segmento A',    12000, 'Activo', '2023-03-15'),
  ('CLI-002', 'Comercial Andina E.I.R.L.',  'compras@andina.pe · Segmento B',   8000, 'Activo', '2024-02-10'),
  ('CLI-003', 'Grupo Cumbre S.R.L.',        'contacto@cumbre.pe · Segmento A', 15000, 'Activo', '2022-08-01')
on conflict (codigo) do nothing;

-- Proveedores
insert into public.proveedores (codigo, razon_social, detalle, linea_credito, estado, ruc, created_at) values
  ('PRV-080', 'Data Systems Perú',    'Infraestructura · comercial@datasystems.pe', 14000, 'En curso', '20345678912', now() - interval '3 days'),
  ('PRV-081', 'Suministros Globales', 'Suministros · ventas@suministros.pe',         9500, 'Activo',   '20456789123', now() - interval '1 day'),
  ('PRV-082', 'Tecno Import S.A.C.',  'Electrónica · contacto@tecnoimport.pe',      18000, 'Activo',   '20543218765', now() - interval '2 hours')
on conflict (codigo) do nothing;

-- Productos (el kardex se genera solo)
insert into public.productos (codigo, nombre, detalle, categoria_id, stock, estado, created_at) values
  ('PRD-004', 'Hub USB-C Pro',          'Accesorios · Almacén central', (select id from public.categorias where nombre = 'Accesorios'), 31, 'Estable',    now() - interval '1 day'),
  ('PRD-003', 'Monitor UltraWide 29',   'Tecnología · Almacén norte',   (select id from public.categorias where nombre = 'Tecnología'), 48, 'Estable',    now() - interval '5 hours'),
  ('PRD-002', 'Teclado mecánico K8',    'Tecnología · Almacén central', (select id from public.categorias where nombre = 'Tecnología'), 12, 'Bajo stock', now() - interval '8 minutes'),
  ('PRD-001', 'Mouse inalámbrico M500', 'Tecnología · Almacén central', (select id from public.categorias where nombre = 'Tecnología'),  6, 'Crítico',    now() - interval '7 minutes')
on conflict (codigo) do nothing;

-- Ventas (se vinculan solas con el cliente por razón social)
insert into public.ventas (codigo, cliente_nombre, detalle, monto, estado, created_at) values
  ('V-2045', 'Inversiones Sol S.A.C.',      'Cotización COT-0098 · Lima',     3175, 'En curso',    now() - interval '1 day'),
  ('V-2046', 'Grupo Cumbre S.R.L.',         'Factura F001-00480 · Cusco',     6240, 'Completada',  now() - interval '3 hours'),
  ('V-2047', 'Comercial Andina E.I.R.L.',   'Factura F001-00481 · Arequipa',  1850, 'Pendiente',   now() - interval '36 minutes'),
  ('V-2048', 'Distribuidora Norte S.A.C.',  'Factura F001-00482 · Lima',      4280, 'Completada',  now() - interval '12 minutes')
on conflict (codigo) do nothing;

-- Compras (fases: Solicitud → Orden → Recepción → Factura → Pagada)
insert into public.compras (codigo, proveedor_nombre, detalle, monto, estado, fecha_limite, comprobante_tipo, comprobante_numero, created_at) values
  ('OC-300', 'Data Systems Perú',    'Recepción · Guía T001-0452 · 4 productos', 1980, 'Recepción', current_date + 2,  'Guía de Remisión', 'T001-0452', now() - interval '3 days'),
  ('OC-301', 'Suministros Globales', 'Factura F002-0091 · Almacén central',       3250, 'Factura',   current_date + 5,  'Factura',           'F002-0091', now() - interval '1 day'),
  ('OC-302', 'Tecno Import S.A.C.',  'Solicitud · 12 productos',                  8420, 'Solicitud', current_date + 15, null,                null,        now() - interval '2 hours')
on conflict (codigo) do nothing;

-- Finanzas (CxC / CxP)
insert into public.pagos (codigo, contraparte, detalle, monto, estado, fecha_vencimiento, created_at) values
  ('CXC-240', 'Factura V-2045', 'Inversiones Sol · Cuenta por cobrar',  3175, 'En curso',  current_date + 20, now() - interval '1 day'),
  ('CXP-118', 'Orden OC-302',   'Tecno Import · Cuenta por pagar',      8420, 'Pendiente', current_date + 15, now() - interval '2 hours'),
  ('CXC-241', 'Factura V-2047', 'Comercial Andina · Cuenta por cobrar', 1850, 'Pendiente', current_date + 17, now() - interval '30 minutes')
on conflict (codigo) do nothing;

-- Documentos
insert into public.documentos (codigo, nombre_archivo, detalle, estado, created_at) values
  ('DOC-079', 'Contrato_Distribuidora_Norte.pdf', 'PDF · 1.4 MB · Cliente CLI-001', 'Vigente', now() - interval '2 days'),
  ('DOC-080', 'OC-302.pdf',                       'PDF · 180 KB · Orden de compra', 'Vigente', now() - interval '2 hours'),
  ('DOC-081', 'Factura_V-2048.pdf',               'PDF · 245 KB · Venta V-2048',    'Vigente', now() - interval '12 minutes')
on conflict (codigo) do nothing;

-- Reportes
insert into public.reportes (codigo, nombre, detalle, estado, created_at) values
  ('RPT-020', 'Cuentas por cobrar',        'Febrero 2026 · PDF · Finanzas',          'Vigente', now() - interval '2 days'),
  ('RPT-021', 'Valorización de inventario','Almacén central · XLSX · Inventario',    'Vigente', now() - interval '3 hours'),
  ('RPT-022', 'Ventas por región',         'Febrero 2026 · PDF · Comercial',         'Vigente', now() - interval '1 hour')
on conflict (codigo) do nothing;

-- Configuración
insert into public.configuracion (codigo, nombre, detalle, estado, created_at) values
  ('CFG-009', 'Categoría Tecnología',      'Catálogo de productos · 48 asociados',       'Activo', now() - interval '2 days'),
  ('CFG-010', 'Almacén central',           'Ubicación operativa · Carlos Méndez',        'Activo', now() - interval '1 day'),
  ('CFG-011', 'Serie de facturación F001', 'IGV 18% · Moneda PEN · Administración',      'Activo', now() - interval '4 hours')
on conflict (codigo) do nothing;

-- Cotizaciones de ejemplo (requiere la migración 20261012000000_cotizaciones.sql).
-- No mueven stock: solo lo hará su venta al convertirlas.
insert into public.cotizaciones (codigo, cliente_nombre, detalle, monto, estado, created_at) values
  ('COT-0006', 'Grupo Cumbre S.R.L.',       'Válida 30 días · Cusco · 2 productos', 5960, 'Aprobada',  now() - interval '1 day'),
  ('COT-0007', 'Distribuidora Norte S.A.C.', 'Válida 15 días · Lima · 2 productos',  2480, 'Pendiente', now() - interval '2 hours')
on conflict (codigo) do nothing;

insert into public.detalle_cotizaciones (cotizacion_id, producto_id, cantidad, precio_unitario)
select (select id from public.cotizaciones where codigo = 'COT-0007'),
       (select id from public.productos where codigo = 'PRD-003'), 2, 1200
where not exists (select 1 from public.detalle_cotizaciones d
                    join public.cotizaciones c on c.id = d.cotizacion_id
                   where c.codigo = 'COT-0007');

insert into public.detalle_cotizaciones (cotizacion_id, producto_id, cantidad, precio_unitario)
select (select id from public.cotizaciones where codigo = 'COT-0007'),
       (select id from public.productos where codigo = 'PRD-004'), 1, 80
where not exists (select 1 from public.detalle_cotizaciones d
                    join public.cotizaciones c on c.id = d.cotizacion_id
                   where c.codigo = 'COT-0007'
                     and d.producto_id = (select id from public.productos where codigo = 'PRD-004'));

insert into public.detalle_cotizaciones (cotizacion_id, producto_id, cantidad, precio_unitario)
select (select id from public.cotizaciones where codigo = 'COT-0006'),
       (select id from public.productos where codigo = 'PRD-003'), 3, 1200
where not exists (select 1 from public.detalle_cotizaciones d
                    join public.cotizaciones c on c.id = d.cotizacion_id
                   where c.codigo = 'COT-0006');

insert into public.detalle_cotizaciones (cotizacion_id, producto_id, cantidad, precio_unitario)
select (select id from public.cotizaciones where codigo = 'COT-0006'),
       (select id from public.productos where codigo = 'PRD-002'), 2, 1180
where not exists (select 1 from public.detalle_cotizaciones d
                    join public.cotizaciones c on c.id = d.cotizacion_id
                   where c.codigo = 'COT-0006'
                     and d.producto_id = (select id from public.productos where codigo = 'PRD-002'));

-- Deja las secuencias por encima de los códigos cargados (nunca las hace retroceder).
select setval('public.seq_cotizaciones', greatest(7, (select last_value from public.seq_cotizaciones)));
select setval('public.seq_ventas',      greatest(2048, (select last_value from public.seq_ventas)));
select setval('public.seq_compras',     greatest(302,  (select last_value from public.seq_compras)));
select setval('public.seq_productos',   greatest(4,    (select last_value from public.seq_productos)));
select setval('public.seq_clientes',    greatest(3,    (select last_value from public.seq_clientes)));
select setval('public.seq_proveedores', greatest(82,   (select last_value from public.seq_proveedores)));
select setval('public.seq_cxc',         greatest(241,  (select last_value from public.seq_cxc)));
select setval('public.seq_cxp',         greatest(118,  (select last_value from public.seq_cxp)));
select setval('public.seq_documentos',  greatest(81,   (select last_value from public.seq_documentos)));
select setval('public.seq_reportes',    greatest(22,   (select last_value from public.seq_reportes)));
select setval('public.seq_config',      greatest(11,   (select last_value from public.seq_config)));
