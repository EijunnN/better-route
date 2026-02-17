# Campos Personalizados

## Que es

Los campos personalizados son campos adicionales que cada empresa define segun su operacion. Permiten capturar informacion que el sistema estandar no contempla, adaptando BetterRoute a las necesidades especificas de cada negocio.

Por ejemplo, una empresa de ecommerce puede necesitar registrar el "monto a cobrar" en cada entrega, mientras que una farmaceutica necesita registrar el "numero de lote". Con campos personalizados, cada empresa configura exactamente la informacion que necesita sin depender de cambios en la plataforma.

Los campos personalizados son independientes por empresa: cada organizacion define los suyos y no afectan a las demas.

## Como funciona

El flujo de trabajo de los campos personalizados tiene tres etapas:

**1. Definicion del campo**

Desde la seccion Configuracion > Campos Personalizados, un administrador crea un nuevo campo especificando:

- El tipo de dato (texto, numero, seleccion, fecha, moneda, telefono, email o si/no)
- Un nombre descriptivo que veran los usuarios
- Un codigo interno que se genera automaticamente a partir del nombre (o se puede personalizar)
- Donde se usa el campo: en los pedidos o en las entregas
- Donde se muestra: tabla de pedidos, app del conductor, importar/exportar CSV
- Si es obligatorio o no
- Un texto de ayuda (placeholder) para guiar al usuario
- Para campos de seleccion, las opciones disponibles

Al crear el campo, el sistema muestra una vista previa en tiempo real de como se vera el campo para los usuarios.

**2. Llenado de datos**

Una vez creado, el campo aparece automaticamente en los lugares configurados:

- Si se asigno a "pedidos": aparece en el formulario de creacion de pedidos y en la importacion CSV
- Si se asigno a "entregas": aparece en la app del conductor al completar cada parada de ruta

**3. Visualizacion**

Los datos ingresados se muestran en:

- La tabla de pedidos (si se activo "Tabla de pedidos")
- La app del conductor (si se activo "App del conductor")
- Las exportaciones e importaciones CSV (si se activo "Importar y exportar")
- El detalle de ruta en monitoreo, donde se muestran los valores de campos personalizados junto a cada parada

## Para que sirve

Los campos personalizados permiten a cada empresa capturar la informacion especifica de su operacion que no esta cubierta por los campos estandar del sistema (direccion, trackcode, peso, volumen, etc.).

En lugar de usar hojas de calculo paralelas o notas en texto libre, la empresa estructura sus datos adicionales directamente dentro de BetterRoute. Esto asegura que la informacion viaje junto con el pedido en todo el ciclo: desde la planificacion, pasando por la ejecucion en campo, hasta los reportes.

## En que ayuda

- **Datos operativos completos**: toda la informacion relevante del pedido esta en un solo lugar, sin necesidad de sistemas externos.
- **Estandarizacion**: campos como "Tipo de servicio" con opciones predefinidas evitan errores de escritura y datos inconsistentes.
- **Trazabilidad**: la informacion ingresada por el conductor en campo queda registrada y vinculada a la entrega.
- **Reportes personalizados**: al exportar a CSV se incluyen los campos personalizados, permitiendo analisis en herramientas externas con todos los datos relevantes.
- **Adaptabilidad por negocio**: cada empresa configura los datos que necesita sin depender del equipo de desarrollo de BetterRoute.

## Tipos de campo disponibles

El sistema ofrece 8 tipos de campo. Al crear un campo nuevo, el primer paso es elegir el tipo:

| Tipo | Descripcion | Ejemplo de uso |
|------|-------------|----------------|
| **Texto** | Texto libre para referencias, nombres u observaciones | Referencia del cliente, instrucciones especiales, numero de guia |
| **Numero** | Valores numericos enteros o con decimales para cantidades y medidas | Cantidad de bultos, peso adicional, piso de entrega |
| **Seleccion** | Lista desplegable con opciones predefinidas por la empresa | Tipo de servicio (Instalacion, Mantenimiento, Entrega, Recojo) |
| **Fecha** | Selector de fecha para vencimientos o programaciones | Fecha de vencimiento del producto, fecha comprometida de entrega |
| **Moneda** | Campo numerico con formato monetario (prefijo $) y decimales | Monto a cobrar al cliente, valor declarado del envio |
| **Telefono** | Campo de texto optimizado para numeros telefonicos | Telefono de contacto del destinatario, telefono alternativo |
| **Email** | Campo de texto con validacion de formato de correo electronico | Correo del destinatario para notificaciones |
| **Si/No** | Casilla de verificacion para opciones binarias | Requiere firma, es fragil, cobro contra entrega |

## Donde se usa el campo

Al crear un campo personalizado se debe elegir en que entidad se asocia. Esto determina en que momento del flujo operativo se ingresa la informacion:

### En los pedidos

El campo se vincula a los pedidos. Aparece en:

- El formulario de creacion y edicion de pedidos
- La importacion masiva por CSV (si la visibilidad CSV esta activa)
- La tabla de pedidos (si la visibilidad en tabla esta activa)

Esta opcion es adecuada cuando la informacion se conoce al momento de planificar: referencia del cliente, tipo de servicio, monto a cobrar, etc.

### En las entregas

El campo se vincula a las paradas de ruta. Lo completa el conductor en la app movil al ejecutar cada entrega.

Esta opcion es adecuada cuando la informacion se obtiene en campo: temperatura al momento de entrega, nombre de quien recibe, numero de conformidad, etc.

## Donde se muestra

Cada campo tiene tres opciones de visibilidad que se pueden activar o desactivar de forma independiente:

### Tabla de pedidos

Cuando se activa, el campo aparece como una columna adicional en la tabla de pedidos. Solo se muestran los campos que estan activos y tienen esta opcion habilitada.

Activar esta opcion es util para campos que el equipo de planificacion necesita ver de un vistazo, como "Tipo de servicio" o "Referencia del cliente".

### App del conductor

Cuando se activa, el campo aparece en la app movil del conductor. El endpoint de la app solo devuelve los campos que tienen esta opcion habilitada.

Esta opcion es relevante para cualquier dato que el conductor necesite ver o completar durante su ruta.

### Importar y exportar (CSV)

Cuando se activa, el campo se incluye en la importacion y exportacion de datos por CSV. Durante la importacion, el sistema intenta hacer coincidir las columnas del archivo CSV con los codigos de los campos personalizados que tengan esta opcion habilitada. Si una columna del CSV coincide con el codigo de un campo, los valores se importan automaticamente.

Para campos numericos y monetarios, el sistema convierte automaticamente los valores del CSV al formato numerico adecuado.

## Obligatoriedad

Cada campo puede marcarse como obligatorio o no. El comportamiento depende de la entidad:

- **Campos en pedidos**: si el campo es obligatorio, no se podra guardar el pedido sin completar ese campo. Esto aplica tanto al formulario manual como a la importacion CSV.
- **Campos en entregas**: si el campo es obligatorio, el conductor no podra completar la entrega en la app sin llenar ese campo.

Los campos opcionales permiten al usuario dejarlos vacios.

## Casos de uso

### Ecommerce y retail

- **Referencia del cliente** (Texto): codigo interno del cliente que solicita el envio.
- **Monto a cobrar** (Moneda): para entregas con cobro contra entrega.
- **Tipo de servicio** (Seleccion): Entrega, Recojo, Cambio, Devolucion.
- **Numero de factura** (Texto): para vincular la entrega con la documentacion fiscal.

### Farmaceutica y salud

- **Numero de lote** (Texto): trazabilidad del lote del medicamento entregado.
- **Requiere refrigeracion** (Si/No): indica si el paquete necesita cadena de frio.
- **Fecha de vencimiento** (Fecha): fecha limite del producto.
- **Temperatura de entrega** (Numero): temperatura registrada al momento de entregar, completada por el conductor.

### Restaurantes y delivery de alimentos

- **Tipo de pedido** (Seleccion): Delivery, Take away, Catering.
- **Monto propina** (Moneda): propina incluida por el cliente.
- **Instrucciones especiales** (Texto): sin cebolla, extra salsa, etc.
- **Requiere cubiertos** (Si/No): si se deben incluir utensilios.

### Logistica industrial y B2B

- **Orden de compra** (Texto): numero de orden de compra del receptor.
- **Contacto en destino** (Texto): nombre de la persona que recibe.
- **Telefono contacto** (Telefono): telefono directo de la persona que recibe.
- **Email de confirmacion** (Email): correo para enviar el comprobante de entrega.
- **Requiere firma** (Si/No): si la entrega necesita firma del receptor.

### Servicios tecnicos y mantenimiento

- **Numero de ticket** (Texto): referencia del sistema de tickets o CRM.
- **Tipo de intervencion** (Seleccion): Instalacion, Reparacion, Mantenimiento preventivo, Retiro.
- **Piso de entrega** (Numero): piso o nivel dentro del edificio.
- **Horario preferido** (Texto): indicacion del cliente sobre el momento preferido.

## Cuando usarlo

Crear campos personalizados es recomendable cuando:

- Se necesita registrar informacion especifica del negocio que no existe en los campos estandar del sistema.
- Se requiere que los conductores capturen datos en campo de forma estructurada (no en texto libre o notas).
- Se necesita exportar datos adicionales junto con los pedidos para reportes o integracion con otros sistemas.
- Se quiere estandarizar la informacion con opciones predefinidas (campos de seleccion) en lugar de depender de texto libre.
- Se necesita que cierta informacion sea obligatoria para garantizar la calidad de los datos.

## Cuando NO usarlo

No es necesario crear campos personalizados cuando:

- La informacion ya existe en los campos estandar del sistema. Por ejemplo, la direccion, el trackcode, el peso, el volumen, el valor del pedido y las ventanas de tiempo ya tienen campos dedicados.
- La informacion es temporal o de una sola vez. Los campos personalizados son para datos que se capturan de forma recurrente en la operacion diaria.
- La informacion no esta vinculada a un pedido o entrega especifica. Si se trata de datos generales de la empresa o del conductor, no corresponde a campos personalizados.
- Se quiere duplicar informacion que ya se captura en otro campo. Antes de crear un campo, verificar que no exista uno estandar o personalizado que ya cumpla esa funcion.

## Relacion con otros modulos

Los campos personalizados se integran con los siguientes modulos de BetterRoute:

### Planificacion (importacion CSV)

Al importar pedidos desde un archivo CSV, el sistema detecta automaticamente las columnas que coinciden con los codigos de campos personalizados marcados con visibilidad CSV. Los valores se mapean e importan junto con los datos estandar del pedido. Esto permite que empresas que trabajan con archivos de clientes incorporen su informacion especifica sin pasos adicionales.

### Tabla de pedidos

Los campos con visibilidad en tabla aparecen como columnas adicionales en la vista de pedidos, permitiendo al equipo de planificacion filtrar y revisar la informacion sin abrir cada pedido individualmente.

### Formulario de pedidos

Los campos asociados a pedidos aparecen como una seccion adicional "Campos Personalizados" en el formulario de creacion y edicion de pedidos, renderizados dinamicamente segun el tipo de cada campo.

### App del conductor

Los campos con visibilidad en app movil se envian al conductor como parte de la informacion de cada parada. Los campos asociados a entregas permiten que el conductor ingrese datos en campo. Los campos asociados a pedidos se muestran como informacion de referencia.

### Monitoreo

En el detalle de ruta del modulo de monitoreo, los valores de campos personalizados se muestran junto a cada parada, permitiendo al supervisor ver la informacion adicional capturada sin salir de la vista de seguimiento.
