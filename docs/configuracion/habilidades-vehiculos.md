# Habilidades de Vehiculos y Conductores

## Que es

El sistema de habilidades (skills) es un mecanismo de compatibilidad que permite definir capacidades especiales y asignarlas tanto a vehiculos como a conductores. Cuando un pedido requiere una habilidad especifica (por ejemplo, "REFRIGERADO"), el sistema se asegura de que solo vehiculos y conductores que posean esa habilidad sean considerados para la entrega. Esto garantiza que cada pedido sea atendido por recursos que cumplen con sus requisitos operativos.

## Como funciona

El sistema opera en tres niveles conectados:

1. **Catalogo de habilidades**: Se definen las habilidades disponibles en el modulo "Habilidades Vehiculos". Cada habilidad tiene un codigo unico (por ejemplo, REFRIGERADO, FRAGIL, MATPEL), un nombre descriptivo y una categoria que la clasifica.

2. **Asignacion a vehiculos y conductores**: Las habilidades del catalogo se asignan individualmente a cada vehiculo y a cada conductor. En el caso de los conductores, las asignaciones pueden incluir fechas de obtencion y vencimiento, lo que permite controlar certificaciones temporales.

3. **Matching en pedidos**: Cuando se carga un pedido, se pueden especificar las habilidades requeridas (campo "Habilidades Requeridas" en el formulario de pedido, separadas por coma). Durante la optimizacion de rutas y la asignacion de conductores, el sistema evalua la compatibilidad entre las habilidades requeridas por el pedido y las habilidades que poseen el vehiculo y el conductor asignados.

El flujo completo es:

- El administrador crea habilidades en el catalogo (ej: REFRIGERADO, CARGA_PESADA).
- El administrador asigna habilidades a vehiculos que las poseen.
- El administrador asigna habilidades a conductores que estan certificados.
- Al crear pedidos, se indican las habilidades requeridas.
- Al optimizar rutas, el sistema considera la compatibilidad de habilidades como uno de los factores de asignacion.

## Para que sirve

El sistema de habilidades permite:

- **Garantizar compatibilidad operativa**: Asegurar que cada pedido sea entregado por un vehiculo y conductor que cumplan con los requisitos especificos del envio.
- **Gestionar certificaciones con vencimiento**: Controlar que las certificaciones de los conductores esten vigentes y recibir alertas cuando estan por vencer.
- **Mejorar la calidad de la planificacion**: El optimizador de rutas incorpora la cobertura de habilidades como metrica de calidad, evitando asignaciones incompatibles.
- **Estandarizar requisitos de entrega**: Crear un vocabulario comun y reutilizable de capacidades operativas a nivel de toda la empresa.

## En que ayuda

- **Cadena de frio**: Evita que pedidos de productos refrigerados o congelados sean asignados a vehiculos sin equipo de refrigeracion, previniendo perdidas de mercaderia.
- **Materiales peligrosos**: Garantiza que sustancias controladas sean transportadas solo por conductores con certificacion MATPEL vigente y vehiculos habilitados.
- **Cargas especiales**: Impide que cargas pesadas o sobredimensionadas sean asignadas a vehiculos sin equipo de elevacion o capacidad estructural adecuada.
- **Cumplimiento normativo**: Asegura que entregas en zonas reguladas (centros historicos, zonas restringidas) sean realizadas por vehiculos y conductores con los permisos necesarios.
- **Control de vencimientos**: Alerta cuando la certificacion de un conductor esta por vencer (menos de 30 dias), permitiendo tomar accion antes de que expire.

## Opciones de configuracion

### Catalogo de habilidades (Habilidades Vehiculos)

Cada habilidad del catalogo tiene los siguientes campos:

| Campo | Obligatorio | Descripcion |
|-------|-------------|-------------|
| Codigo | Si | Identificador unico en mayusculas. Solo permite letras mayusculas, numeros, guiones y guiones bajos. Maximo 50 caracteres. Ejemplos: REFRIGERADO, CARGA_PESADA, MATPEL. |
| Nombre | Si | Nombre descriptivo de la habilidad. Maximo 255 caracteres. Ejemplo: "Camara Refrigerada". |
| Categoria | Si | Clasificacion de la habilidad. Opciones disponibles: **Equipamiento**, **Temperatura**, **Certificaciones**, **Especiales**. |
| Descripcion | No | Texto libre para detallar la habilidad. Maximo 1000 caracteres. |
| Estado | Si | Activo o Inactivo. Solo las habilidades activas son consideradas en la operacion. |

### Categorias disponibles

| Categoria | Uso tipico |
|-----------|------------|
| Equipamiento | Capacidades fisicas del vehiculo: rampa hidraulica, GPS, camara, grua. |
| Temperatura | Control termico: refrigerado, congelado, calefaccionado. |
| Certificaciones | Permisos y habilitaciones: MATPEL, transporte de alimentos, permisos de zona. |
| Especiales | Capacidades particulares: carga fragil, sobredimensionada, valores. |

### Asignacion a conductores

Al asignar una habilidad a un conductor, se configuran los siguientes campos:

| Campo | Obligatorio | Descripcion |
|-------|-------------|-------------|
| Conductor | Si | Conductor al que se asigna la habilidad. Se selecciona de la lista de conductores activos. |
| Habilidad | Si | Habilidad del catalogo a asignar. Se selecciona de la lista de habilidades activas. |
| Fecha de Obtencion | No | Fecha en que el conductor obtuvo la habilidad o certificacion. Por defecto: fecha actual. |
| Fecha de Vencimiento | No | Fecha en que la habilidad o certificacion expira. Si se deja vacio, la habilidad no tiene vencimiento. |
| Estado | Si | Activo o Inactivo. |

### Estados de vencimiento de habilidades de conductor

El sistema calcula automaticamente el estado de vencimiento:

| Estado | Condicion | Efecto |
|--------|-----------|--------|
| Vigente | La fecha de vencimiento no esta definida o es mayor a 30 dias en el futuro. | La habilidad se considera valida para la asignacion. |
| Pronto a vencer | La fecha de vencimiento esta a menos de 30 dias. | La habilidad aun es valida, pero el sistema genera una advertencia visual. |
| Vencida | La fecha de vencimiento ya paso. | La habilidad no es valida. El conductor no es compatible con pedidos que la requieran. |

### Filtros disponibles

En la pantalla del catalogo de habilidades:
- Busqueda por texto (codigo, nombre o descripcion)
- Filtro por categoria
- Filtro por estado (activo/inactivo)

En la pantalla de habilidades de conductores:
- Filtro por conductor
- Filtro por categoria de habilidad
- Filtro por estado (activo/inactivo)
- Filtro por estado de vencimiento (vigente, pronto a vencer, vencida)

## Casos de uso

### 1. Cadena de frio para productos perecederos

Una empresa de distribucion de alimentos crea la habilidad "REFRIGERADO" en la categoria Temperatura. Asigna esta habilidad a los 5 vehiculos que cuentan con camara refrigerada y a los conductores capacitados en manejo de cadena de frio. Cuando llegan pedidos de lacteos o congelados, se marcan con la habilidad "REFRIGERADO". El optimizador solo asigna estos pedidos a vehiculos y conductores compatibles.

### 2. Transporte de materiales peligrosos

Una empresa logistica crea "MATPEL" en la categoria Certificaciones. Los conductores que obtienen la certificacion MATPEL se registran con su fecha de obtencion y vencimiento. Si la certificacion vence en los proximos 30 dias, el sistema alerta al administrador. Si ya vencio, el conductor no sera considerado para pedidos que requieran MATPEL.

### 3. Entregas con equipo especial

Una empresa de muebles crea "RAMPA_HIDRAULICA" en Equipamiento. Solo los camiones con rampa hidraulica reciben esta habilidad. Los pedidos de muebles pesados se configuran requiriendo "RAMPA_HIDRAULICA", asegurando que no se asignen a furgonetas sin este equipo.

### 4. Zonas con restricciones de acceso

Una empresa que opera en una ciudad con centro historico restringido crea "PERMISO_CENTRO" en Especiales. Solo los vehiculos pequenos con permiso municipal vigente y sus conductores reciben esta habilidad. Los pedidos dirigidos a direcciones del centro historico requieren "PERMISO_CENTRO".

### 5. Manipulacion de productos fragiles

Una empresa de electronica crea "FRAGIL" en Especiales. Los conductores que completaron la capacitacion de manejo de productos fragiles reciben esta habilidad. Los pedidos de pantallas, vidrios y equipos sensibles requieren "FRAGIL", garantizando un manejo adecuado.

## Cuando usarlo

- Cuando la flota incluye vehiculos con capacidades diferentes (refrigerados vs. secos, con rampa vs. sin rampa).
- Cuando ciertos pedidos requieren condiciones especiales de transporte.
- Cuando los conductores necesitan certificaciones o capacitaciones especificas para ciertos tipos de carga.
- Cuando existen regulaciones que exigen permisos especificos para operar en ciertas zonas o con ciertos productos.
- Cuando se quiere automatizar la validacion de compatibilidad entre recursos y pedidos, en lugar de depender de verificaciones manuales.

## Cuando NO usarlo

- **Flota homogenea**: Si todos los vehiculos tienen las mismas capacidades y todos los conductores las mismas certificaciones, no se necesitan habilidades. Agregan complejidad sin beneficio.
- **Criterios que cambian por pedido**: Si la restriccion es particular de un solo pedido y no se repite, es mas practico usar las notas del pedido en lugar de crear una habilidad.
- **Control de capacidad de carga**: Para restricciones de peso o volumen, use los campos de capacidad del vehiculo (peso maximo, volumen maximo). Las habilidades no reemplazan los limites de capacidad.
- **Restricciones geograficas**: Para limitar vehiculos a zonas especificas, use el modulo de Zonas. Las habilidades son para capacidades operativas, no para delimitaciones geograficas (aunque pueden complementarse).
- **Demasiadas habilidades**: Evite crear habilidades excesivamente granulares. Un catalogo de 3 a 10 habilidades bien definidas es mas manejable que 50 habilidades hiper-especificas.

## Relacion con otros modulos

| Modulo | Relacion |
|--------|----------|
| **Vehiculos** | Los vehiculos reciben asignaciones de habilidades del catalogo. Un vehiculo puede tener multiples habilidades (ej: REFRIGERADO + RAMPA_HIDRAULICA). Las propiedades nativas del vehiculo (refrigerado, calefaccionado, elevacion) se complementan con el sistema de habilidades. |
| **Conductores** | Los conductores (usuarios con rol CONDUCTOR) reciben habilidades con fechas de obtencion y vencimiento. El sistema valida que el conductor tenga habilidades vigentes antes de considerarlo compatible. |
| **Pedidos** | Cada pedido puede declarar habilidades requeridas en el campo "Habilidades Requeridas" (codigos separados por coma). Estos codigos se comparan contra las habilidades del vehiculo y conductor asignados. |
| **Optimizacion de rutas** | El motor de optimizacion considera la cobertura de habilidades (skill coverage) como una metrica de calidad del plan. La estrategia de asignacion "SKILLS_FIRST" prioriza la compatibilidad de habilidades por sobre otros factores. |
| **Asignacion de conductores** | El sistema de asignacion automatica calcula un puntaje de compatibilidad de habilidades (skillsMatch, de 0 a 100) como uno de los factores para determinar el mejor conductor. Si un conductor carece de habilidades requeridas o las tiene vencidas, su puntaje baja o se descarta. |
| **Importacion CSV** | Al importar pedidos por CSV, se pueden incluir las habilidades requeridas como parte de los datos del pedido. |
| **Dashboard de optimizacion** | El panel de resultados muestra la metrica "Skill Coverage" que indica el porcentaje de pedidos cuyas habilidades requeridas fueron cubiertas correctamente. |
