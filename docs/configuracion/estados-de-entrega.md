# Estados de Entrega

## Que es

Los Estados de Entrega son el sistema que define por cuales etapas pasa cada entrega dentro de BetterRoute. Cada empresa puede personalizar estos estados con nombres, colores y requerimientos propios, adaptando el flujo de trabajo a su operacion real.

El sistema funciona con una arquitectura de dos niveles: cinco estados base del sistema (que no cambian) y estados personalizados por empresa (que si se pueden adaptar). Cada estado personalizado esta asociado a uno de los cinco estados base, lo que permite que el sistema interno funcione de manera uniforme mientras cada empresa ve los nombres y flujos que mejor representan su negocio.

## Como funciona

El flujo de configuracion tiene tres partes principales:

**1. Elegir una plantilla o empezar desde cero**

Al acceder por primera vez a la configuracion de estados, el sistema presenta tres plantillas predefinidas y la opcion de crear un flujo personalizado:

- **Delivery de ultima milla**: Pendiente, En camino, Entregado, No entregado, Omitido
- **Paqueteria**: Pendiente, En transito, Entrega parcial, Entregado, Devuelto, Cancelado
- **Distribucion B2B**: Pendiente, Descargando, Factura firmada, Rechazo, Sin acceso

Cada plantilla viene preconfigurada con estados, transiciones permitidas y requerimientos apropiados para ese tipo de operacion.

**2. Personalizar los estados**

Cada estado tiene las siguientes propiedades:

- **Nombre** (label): El nombre visible que veran los usuarios y conductores (ej: "En camino", "Entregado")
- **Codigo**: Identificador interno en mayusculas (ej: EN_CAMINO). Se genera automaticamente a partir del nombre si se deja vacio
- **Estado base del sistema**: A cual de los 5 estados del sistema corresponde (ver seccion siguiente)
- **Color**: Color para identificar visualmente el estado en toda la plataforma
- **Requerimientos**: Que evidencia debe capturar el conductor al marcar este estado (foto, firma, notas, motivo)
- **Terminal**: Si el estado es final (la entrega no puede avanzar a otro estado despues)
- **Por defecto**: Si es el estado inicial que se asigna automaticamente a nuevas entregas

**3. Configurar transiciones**

Las transiciones definen desde que estado se puede pasar a que otro estado. Esto se configura mediante una matriz donde se marcan las combinaciones permitidas. Los estados terminales no pueden tener transiciones de salida (la entrega ya termino). Esto evita que un conductor marque una entrega como "Entregado" y luego la cambie a "En camino", por ejemplo.

## Para que sirve

El sistema de estados de entrega permite que cada empresa refleje su proceso operativo real dentro de la plataforma. En lugar de usar estados genericos que no se ajustan a todas las industrias, cada empresa puede:

- Definir los pasos exactos que sigue una entrega en su operacion
- Establecer que evidencia necesita en cada paso
- Controlar que transiciones son validas para evitar errores operativos
- Usar terminologia propia en lugar de nombres genericos

## En que ayuda

- **Trazabilidad completa**: Saber exactamente en que paso se encuentra cada entrega, con la evidencia correspondiente
- **Pruebas de entrega**: Requerir foto, firma o notas como comprobante de que la entrega se realizo correctamente
- **Analisis de motivos de fallo**: Cuando una entrega falla, registrar el motivo especifico (cliente ausente, direccion incorrecta, paquete danado, etc.) para identificar patrones y mejorar la operacion
- **Reduccion de errores**: Al limitar las transiciones permitidas, se previenen cambios de estado incorrectos o accidentales
- **Consistencia operativa**: Todos los conductores siguen el mismo flujo definido por la empresa

## Estados base del sistema

Cada estado personalizado debe estar asociado a uno de estos cinco estados base. El sistema utiliza estos estados internamente para funcionalidades como reportes, dashboards y logica de negocio.

| Estado base | Descripcion | Ejemplo de uso |
|---|---|---|
| **PENDING** (Pendiente) | La entrega aun no ha sido iniciada. Es el punto de partida del flujo. | "Pendiente", "En espera", "Programado" |
| **IN_PROGRESS** (En progreso) | La entrega esta siendo procesada o el conductor esta en camino. | "En camino", "En transito", "Descargando", "Entrega parcial" |
| **COMPLETED** (Completado) | La entrega se realizo exitosamente. Estado terminal por defecto. | "Entregado", "Factura firmada", "Recibido conforme" |
| **FAILED** (Fallido) | La entrega no pudo completarse. Estado terminal por defecto. | "No entregado", "Devuelto", "Rechazo", "Sin acceso" |
| **CANCELLED** (Cancelado) | La entrega fue cancelada u omitida. Estado terminal por defecto. | "Omitido", "Cancelado", "Reprogramado" |

Una empresa puede tener multiples estados asociados al mismo estado base. Por ejemplo, una empresa de distribucion B2B podria tener "Rechazo" y "Sin acceso" ambos asociados al estado base FAILED, cada uno con sus propios motivos de fallo.

## Opciones de personalizacion por estado

Cada estado se puede configurar con las siguientes opciones:

### Datos basicos

| Campo | Descripcion | Ejemplo |
|---|---|---|
| **Nombre** | Texto visible para usuarios y conductores | "En camino" |
| **Codigo** | Identificador unico interno (auto-generado si se omite) | EN_CAMINO |
| **Estado base** | Categoria del sistema a la que pertenece | IN_PROGRESS |
| **Color** | Color hexadecimal para identificacion visual | #3B82F6 (azul) |
| **Posicion** | Orden en que aparece el estado en la lista | 1 |

### Requerimientos de evidencia

Estos requerimientos se activan o desactivan por estado. Cuando estan activos, el conductor debe cumplirlos al marcar una entrega con ese estado desde la app movil.

| Requerimiento | Descripcion | Uso tipico |
|---|---|---|
| **Foto** | El conductor debe tomar una foto como evidencia | Prueba de entrega, evidencia de fallo |
| **Firma** | El conductor debe capturar la firma del receptor | Entregas de paqueteria, documentos legales |
| **Notas** | El conductor debe escribir una nota o comentario | Entregas parciales, instrucciones especiales |
| **Motivo** | El conductor debe seleccionar un motivo de una lista predefinida | Entregas fallidas, devoluciones |

### Opciones de motivo

Cuando el requerimiento de "Motivo" esta activo, se puede definir una lista de opciones predefinidas que el conductor selecciona. Por ejemplo, para un estado de entrega fallida:

- Cliente ausente
- Direccion incorrecta
- Paquete danado
- Cliente rechazo
- Zona insegura
- Reprogramado
- Otro

### Propiedades de comportamiento

| Propiedad | Descripcion |
|---|---|
| **Terminal** | Si esta activo, la entrega no puede cambiar a otro estado despues. Indica que el flujo termino. |
| **Por defecto** | Si esta activo, las nuevas entregas comienzan con este estado automaticamente. Solo un estado deberia tener esta propiedad. |

## Casos de uso

### Empresa de delivery que necesita prueba fotografica

Una empresa de delivery de ultima milla necesita que cada entrega completada tenga una foto como evidencia. Configura el estado "Entregado" (COMPLETED) con el requerimiento de foto activado. Asi, el conductor no puede marcar la entrega como completada sin tomar una foto del paquete en la puerta del cliente.

### Empresa de paqueteria con firma obligatoria

Una empresa de paqueteria necesita la firma del receptor como prueba legal de entrega. Configura el estado "Entregado" con los requerimientos de foto y firma activados. El conductor debe capturar ambas evidencias antes de poder completar la entrega.

### Motivos de fallo personalizados para distribucion B2B

Una empresa de distribucion a negocios tiene motivos de fallo muy especificos de su industria: "Producto incorrecto", "Cantidad incorrecta", "Sin orden de compra". Crea estados de tipo FAILED con estos motivos predefinidos para que los conductores seleccionen el motivo exacto, lo que permite analizar y corregir los problemas mas frecuentes.

### Empresa con entregas parciales

Una empresa de paqueteria necesita manejar entregas parciales donde solo se entrega parte del pedido. Crea un estado "Entrega parcial" asociado a IN_PROGRESS con el requerimiento de notas activado, para que el conductor documente que se entrego y que quedo pendiente. Desde ese estado, la entrega puede transicionar a "Entregado" (cuando se completa el resto) o a "Devuelto".

### Empresa con multiples tipos de fallo

Una empresa necesita distinguir entre diferentes tipos de fallo: "Rechazo" (el cliente no acepta el pedido) y "Sin acceso" (no se puede llegar al destino). Crea dos estados separados, ambos asociados a FAILED pero con motivos distintos. Esto permite generar reportes diferenciados y tomar acciones correctivas especificas para cada tipo de problema.

## Cuando usarlo

- Cuando la empresa necesita ver nombres de estado que reflejen su terminologia operativa
- Cuando se necesita exigir evidencia especifica (foto, firma) en ciertos estados
- Cuando se quieren rastrear motivos de fallo especificos del negocio
- Cuando el flujo de entrega tiene pasos intermedios que los estados genericos no cubren (entregas parciales, descarga, firma de factura)
- Cuando se necesita limitar que cambios de estado son permitidos para evitar errores
- Cuando diferentes tipos de fallo requieren tratamiento y analisis diferenciado

## Cuando NO usarlo

Los estados por defecto que proporciona el sistema (a traves de las plantillas predefinidas) ya cubren la mayoria de las operaciones de entrega estandar. No es necesario personalizar los estados si:

- La operacion sigue un flujo simple de Pendiente, En camino, Entregado/No entregado
- No se necesita evidencia adicional mas alla de lo basico
- Los motivos de fallo genericos (cliente ausente, direccion incorrecta, etc.) son suficientes
- La empresa esta comenzando y aun no ha definido su proceso operativo con claridad

En estos casos, elegir una de las plantillas predefinidas es la opcion mas rapida y efectiva.

## Relacion con otros modulos

### App del conductor

Los estados configurados aparecen directamente en la aplicacion movil del conductor. Cuando el conductor cambia el estado de una entrega, la app le muestra solo las transiciones permitidas y le solicita la evidencia requerida (foto, firma, notas, motivo) segun la configuracion del estado destino.

### Monitoring (seguimiento en vivo)

El modulo de monitoring muestra el estado actual de cada entrega en tiempo real. Los colores y nombres personalizados se reflejan en el dashboard, permitiendo identificar rapidamente el estado de la operacion. Los estados terminales (COMPLETED, FAILED, CANCELLED) se contabilizan en las metricas de cumplimiento.

### Paradas de ruta (Route Stops)

Cada parada de ruta tiene una referencia al estado de workflow actual. Cuando un conductor actualiza el estado de una entrega, se registra la referencia al estado de workflow correspondiente junto con toda la evidencia capturada.

### Reportes y analisis

Los motivos de fallo capturados a traves de los estados de workflow alimentan los reportes de la plataforma. Esto permite analizar tendencias como: cuales son los motivos de fallo mas frecuentes, en que zonas hay mas rechazos, o que porcentaje de entregas requieren reprogramacion.
