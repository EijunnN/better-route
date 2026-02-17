# Ventanas de Tiempo

## Que es

Las ventanas de tiempo son configuraciones predefinidas (presets) que establecen los horarios permitidos para realizar entregas a cada cliente. Cada preset define un rango horario o una hora exacta durante la cual el conductor debe llegar al punto de entrega. Estos presets se crean una vez y se reutilizan al asignarlos a los pedidos, evitando configurar horarios manualmente cada vez.

## Como funciona

1. **Acceso**: Desde el menu lateral, en la seccion Configuracion, se selecciona "Ventanas de Tiempo". Se requiere el permiso `time_window_preset:read` para visualizar y `time_window_preset:write` para modificar.

2. **Creacion de presets**: Se presiona "Crear Preset" y se completa un formulario con:
   - Nombre descriptivo del preset (por ejemplo, "Entrega Manana", "Recogida Tarde").
   - Tipo de ventana: Turno, Rango o Exacto.
   - Horarios correspondientes segun el tipo elegido.
   - Nivel de rigurosidad: Estricto o Flexible.

3. **Asignacion a pedidos**: Al crear o editar un pedido, en la seccion "Configuracion de Ventana de Tiempo" se selecciona uno de los presets activos. El pedido hereda automaticamente los horarios y la rigurosidad del preset. Opcionalmente, se puede sobreescribir la rigurosidad a nivel de pedido individual sin modificar el preset original.

4. **Impacto en la planificacion**: En el modulo de Planificacion, los pedidos con ventana de tiempo asignada aparecen en la pestana "Con Horario", lo que permite al planificador identificarlos rapidamente. El motor de optimizacion utiliza estos horarios para calcular rutas que respeten las restricciones de tiempo.

5. **Validacion durante la optimizacion**: El sistema evalua si el horario estimado de llegada del conductor cumple con la ventana de tiempo. Dependiendo de la rigurosidad configurada:
   - **Estricto (HARD)**: Si la hora estimada de llegada cae fuera de la ventana, el pedido se rechaza de esa ruta.
   - **Flexible (SOFT)**: Si la hora estimada de llegada cae fuera de la ventana, el pedido se permite pero se aplica una penalizacion proporcional al retraso, lo que hace que el optimizador busque alternativas mejores.

6. **Persistencia**: Los presets se guardan por empresa (multi-tenant). Cada empresa tiene sus propios presets independientes. Los nombres de presets deben ser unicos dentro de la misma empresa.

## Para que sirve

- Garantizar que las entregas se realicen dentro de los horarios acordados con los clientes.
- Estandarizar las ventanas horarias de entrega en toda la operacion, evitando configuracion manual repetitiva.
- Alimentar al motor de optimizacion con restricciones temporales para calcular rutas viables.
- Diferenciar entre restricciones estrictas (que no se pueden violar) y flexibles (que se pueden violar con penalizacion).
- Permitir sobreescrituras puntuales por pedido cuando un cliente tiene una necesidad especial sin alterar la configuracion general.

## En que ayuda

- **Cumplimiento de SLA**: Al definir ventanas de tiempo con rigurosidad estricta, se asegura que los compromisos horarios con clientes se respeten. El sistema no permite asignar entregas fuera de horario.
- **Reduccion de entregas fallidas**: Los conductores llegan en el horario en que el cliente esta disponible para recibir, reduciendo los intentos fallidos de entrega.
- **Satisfaccion del cliente**: Los clientes reciben sus entregas cuando lo esperan. Esto es particularmente importante para clientes corporativos con horarios de recepcion restringidos.
- **Optimizacion de rutas realista**: El planificador de rutas calcula trayectos que no solo minimizan distancia sino que tambien respetan las ventanas horarias, generando planes ejecutables en la realidad.
- **Flexibilidad operativa**: El modo flexible (SOFT) permite que la operacion no se detenga por restricciones menores, penalizando retrasos en lugar de bloquearlos, lo que resulta en planes mas completos.

## Opciones de configuracion

### Campos del preset

| Campo | Descripcion | Obligatorio |
|-------|------------|-------------|
| **Nombre** | Identificador descriptivo del preset. Debe ser unico dentro de la empresa. Ejemplo: "Manana Express", "Horario Oficina". | Si |
| **Tipo** | Define como se estructura la ventana de tiempo. Ver detalle abajo. | Si |
| **Hora Inicio** | Hora de inicio del rango (formato HH:MM). Aplica para tipos Turno y Rango. | Si (Turno/Rango) |
| **Hora Fin** | Hora de fin del rango (formato HH:MM). Debe ser posterior a la hora de inicio. | Si (Turno/Rango) |
| **Hora Exacta** | Hora puntual de entrega (formato HH:MM). Aplica solo para tipo Exacto. | Si (Exacto) |
| **Tolerancia (minutos)** | Margen de tolerancia en minutos antes y despues de la hora exacta. Aplica solo para tipo Exacto. | Si (Exacto) |
| **Rigurosidad** | Nivel de exigencia en el cumplimiento. Ver detalle abajo. | Si |
| **Activo** | Indica si el preset esta disponible para asignarse a pedidos. Los presets inactivos no aparecen como opcion al crear pedidos. Solo visible al editar. | No |

### Tipos de ventana

| Tipo | Etiqueta en pantalla | Descripcion | Ejemplo |
|------|---------------------|-------------|---------|
| **SHIFT** | Turno | Rango horario recurrente. Define un bloque de tiempo con hora de inicio y fin. Pensado para turnos operativos regulares. | 08:00 - 12:00 |
| **RANGE** | Rango | Rango de tiempo unico. Similar al turno pero conceptualmente representa un rango especifico, no necesariamente recurrente. | 14:00 - 16:00 |
| **EXACT** | Exacto | Hora especifica con tolerancia. Define una hora puntual y un margen en minutos. La entrega debe ocurrir dentro de ese margen. | 10:30 con tolerancia de 15 min (10:15 - 10:45) |

### Niveles de rigurosidad

| Nivel | Etiqueta en pantalla | Comportamiento |
|-------|---------------------|----------------|
| **HARD** | Estricto | El sistema rechaza la asignacion si la hora estimada de llegada cae fuera de la ventana. La entrega no se puede planificar en esa ruta. Garantiza cumplimiento absoluto. |
| **SOFT** | Flexible | El sistema permite la asignacion aunque la hora estimada de llegada caiga fuera de la ventana, pero aplica una penalizacion proporcional al retraso. El optimizador prioriza otras alternativas con menor penalizacion. Factor de penalizacion configurable (por defecto: 5x por minuto de retraso). |

### Sobreescritura por pedido

Al asignar un preset a un pedido, se puede sobreescribir la rigurosidad a nivel individual:

| Opcion | Descripcion |
|--------|-------------|
| **Heredar del preset** | El pedido usa la rigurosidad configurada en el preset (comportamiento por defecto). |
| **Estricto** | El pedido fuerza modo estricto aunque el preset sea flexible. |
| **Flexible** | El pedido fuerza modo flexible aunque el preset sea estricto. |

## Casos de uso

### 1. Restaurantes y servicios de alimentacion
Un restaurante recibe insumos solo entre las 06:00 y las 08:00, antes de que abra al publico. Se crea un preset "Abastecimiento Restaurantes" de tipo Turno (06:00 - 08:00) con rigurosidad Estricta. Ningun pedido se planifica fuera de ese horario.

### 2. Farmacias con cadena de frio
Una farmaceutica requiere entregas de medicamentos refrigerados en un horario exacto para coordinar con su equipo de recepcion. Se crea un preset "Recepcion Cadena Frio" de tipo Exacto (10:00, tolerancia 10 min) con rigurosidad Estricta. El conductor debe llegar entre 09:50 y 10:10.

### 3. E-commerce con entrega en franja horaria
Un e-commerce ofrece a sus clientes elegir entre franjas "Manana (09:00-13:00)" y "Tarde (14:00-18:00)". Se crean dos presets de tipo Rango con rigurosidad Flexible. Si un conductor llega 5 minutos tarde, el pedido no se rechaza pero el optimizador intentara alternativas mejores.

### 4. Oficinas corporativas con horario de recepcion
Una empresa solo recibe paquetes entre las 09:00 y las 17:00. Se crea un preset "Horario Oficina" de tipo Turno (09:00 - 17:00) con rigurosidad Estricta. Es un rango amplio que da flexibilidad al optimizador pero garantiza que la entrega ocurra en horario laboral.

### 5. Entrega urgente con hora comprometida
Un cliente paga por entrega express con hora comprometida a las 14:00. Se usa un preset "Express" de tipo Exacto (14:00, tolerancia 15 min) con rigurosidad Estricta. Para un caso puntual donde el compromiso es menos rigido, se puede sobreescribir la rigurosidad del pedido individual a Flexible.

## Cuando usarlo

- Cuando los clientes tienen horarios de recepcion definidos (oficinas, comercios, restaurantes).
- Cuando se ofrecen franjas horarias de entrega al cliente final (manana, tarde, noche).
- Cuando existen acuerdos de nivel de servicio (SLA) con compromisos de hora.
- Cuando se manejan productos sensibles al tiempo (alimentos, medicamentos) que requieren coordinacion precisa.
- Cuando se quiere alimentar al optimizador de rutas con restricciones temporales realistas para generar planes ejecutables.
- Cuando se desea estandarizar las franjas horarias de la operacion sin depender de configuracion manual por pedido.

## Cuando NO usarlo

- **Pedidos sin restriccion horaria**: Si la entrega puede ocurrir en cualquier momento del dia, no es necesario asignar un preset. Dejar el campo vacio en el pedido permite que el optimizador tenga total libertad para planificar la ruta.
- **Operaciones 24 horas sin restriccion**: Si todos los puntos de entrega estan disponibles las 24 horas, agregar ventanas de tiempo solo agrega restricciones innecesarias al optimizador y puede generar rutas menos eficientes.
- **Demasiados presets para pocas variaciones**: Si todos los clientes tienen el mismo horario, es mejor no crear multiples presets redundantes. Un solo preset reutilizable es suficiente.
- **Presets de prueba en produccion**: No dejar presets de prueba activos. Los presets inactivos no aparecen en la seleccion de pedidos, pero generan ruido en la lista de configuracion. Eliminar o desactivar los que no se usen.
- **Rigurosidad Estricta por defecto sin analisis**: No configurar todos los presets como Estrictos si la operacion no lo requiere. Esto puede causar que el optimizador no encuentre rutas viables para algunos pedidos. Usar Flexible cuando haya margenes aceptables de retraso.

## Relacion con otros modulos

### Pedidos
Cada pedido puede tener asignado un preset de ventana de tiempo mediante el campo `timeWindowPresetId`. Al crear o editar un pedido, el selector de presets muestra los presets activos de la empresa. La rigurosidad se puede sobreescribir a nivel de pedido individual. Los pedidos tambien pueden importarse desde CSV incluyendo el ID del preset en las columnas `time_window_preset_id`, `preset_id` o `ventana_horaria_id`.

### Planificacion
En el modulo de Planificacion, los pedidos con ventana de tiempo asignada se pueden filtrar en la pestana "Con Horario". Esto permite al planificador identificar rapidamente cuales pedidos tienen restricciones temporales y priorizarlos en la asignacion de rutas.

### Optimizacion de Rutas
El motor de optimizacion lee las ventanas de tiempo de cada pedido y las utiliza como restricciones al calcular rutas. En modo Estricto, los pedidos que no pueden cumplir la ventana se excluyen de la ruta. En modo Flexible, se aplica una penalizacion proporcional al retraso (factor configurable, por defecto 5x por minuto) que guia al optimizador hacia soluciones con menor violacion de horarios.

### Perfil de Empresa
Los presets se guardan a nivel de empresa. Cada empresa gestiona sus propios presets de forma independiente. El contexto de empresa se hereda automaticamente del usuario logueado.

### Importacion Masiva (CSV)
Al importar pedidos por CSV, se puede especificar el ID del preset de ventana de tiempo para asignar automaticamente la ventana horaria a cada pedido importado. El sistema reconoce multiples variaciones del nombre de columna: `time_window_preset_id`, `preset_id`, `ventana_horaria_id`, entre otras.
