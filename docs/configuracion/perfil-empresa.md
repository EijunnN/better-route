# Perfil de Empresa

## Que es

El Perfil de Empresa es la configuracion central que define como opera tu empresa dentro de BetterRoute. Establece que dimensiones de capacidad (peso, volumen, valorizado, unidades) son relevantes para tu negocio, y como se priorizan los distintos tipos de pedidos. Esta configuracion adapta toda la plataforma --formularios, plantillas CSV, optimizacion de rutas-- a las necesidades especificas de tu operacion logistica.

## Como funciona

El Perfil de Empresa se accede desde la seccion **Configuracion** en el menu principal. La pantalla presenta tres areas principales:

1. **Plantillas rapidas**: Configuraciones predefinidas segun tipo de negocio. Al seleccionar una, se aplican automaticamente las dimensiones correspondientes. Los cambios no se guardan hasta que el usuario presiona "Guardar".

2. **Dimensiones de capacidad**: Cuatro opciones que se activan o desactivan con un clic:
   - Peso (gramos)
   - Volumen (litros)
   - Valorizado (valor monetario)
   - Unidades (cantidad de items)

3. **Tipos de pedido y prioridades**: Opcion para habilitar la clasificacion automatica de pedidos (Nuevo, Reprogramado, Urgente) con un deslizador de prioridad de 0 a 100 para cada tipo.

Todos los cambios quedan marcados como "sin guardar" hasta que se confirman con el boton Guardar. Tambien existe la opcion de restablecer el perfil a los valores predeterminados (peso y volumen activos, sin valorizado ni unidades).

Cada empresa tiene un unico perfil activo. Si no se ha configurado uno, el sistema utiliza valores predeterminados (peso y volumen habilitados).

## Para que sirve

El Perfil de Empresa permite que BetterRoute se adapte al tipo de negocio de cada cliente. Sus funciones principales son:

- **Definir restricciones de capacidad**: Determina que limites aplican a vehiculos y pedidos durante la optimizacion de rutas. Una empresa de electronica necesita controlar el valorizado; una de logistica tradicional, el peso y volumen.
- **Configurar prioridades de entrega**: Establece que tan urgente es cada tipo de pedido, lo cual influye directamente en el orden de las rutas optimizadas.
- **Simplificar la experiencia de usuario**: Los formularios de pedidos y vehiculos solo muestran los campos relevantes segun el perfil. Si la empresa no usa "Unidades", ese campo no aparece.
- **Generar plantillas CSV personalizadas**: La plantilla de importacion masiva de pedidos se adapta al perfil, incluyendo solo las columnas necesarias.

## En que ayuda

- **Reduce errores de carga de datos**: Al ocultar campos irrelevantes, los operadores no tienen que decidir que llenar y que dejar vacio.
- **Optimiza rutas con precision**: El motor de optimizacion (VROOM) recibe arrays de capacidad que coinciden exactamente con lo que la empresa necesita controlar, evitando restricciones innecesarias o faltantes.
- **Acelera la incorporacion de nuevas empresas**: Las plantillas rapidas permiten configurar una empresa en segundos, sin necesidad de ajustar campo por campo.
- **Mejora la priorizacion de entregas**: Los pedidos urgentes o reprogramados reciben mayor prioridad automaticamente, asegurando que las entregas criticas se planifiquen primero.
- **Mantiene consistencia entre modulos**: La misma configuracion rige en pedidos, vehiculos, importacion CSV y optimizacion de rutas.

## Opciones de configuracion

### Dimensiones de capacidad

| Dimension | Descripcion | Unidad | Valor por defecto |
|-----------|-------------|--------|-------------------|
| Peso | Restriccion por peso del paquete. Aplica limites de peso tanto a pedidos como a vehiculos. | Gramos | Activado |
| Volumen | Restriccion por volumen del paquete. Controla el espacio fisico disponible en cada vehiculo. | Litros | Activado |
| Valorizado | Restriccion por valor monetario del pedido. Limita el valor total que un vehiculo puede transportar. | Moneda local | Desactivado |
| Unidades | Restriccion por cantidad de items o paquetes. Limita cuantos items puede llevar un vehiculo. | Cantidad | Desactivado |

### Tipos de pedido y prioridades

| Opcion | Descripcion | Rango | Valor por defecto |
|--------|-------------|-------|-------------------|
| Habilitar tipos de pedido | Activa la clasificacion automatica de pedidos en tres categorias. | ON / OFF | Desactivado |
| Prioridad: Pedido Nuevo | Nivel de prioridad para pedidos que se entregan por primera vez. | 0 - 100 | 50 (media) |
| Prioridad: Reprogramado | Nivel de prioridad para pedidos que fueron reprogramados desde una fecha anterior. | 0 - 100 | 80 (alta) |
| Prioridad: Urgente | Nivel de prioridad para pedidos que requieren entrega inmediata o con plazo critico. | 0 - 100 | 100 (maxima) |

Los niveles de prioridad se interpretan asi:
- 0: Sin prioridad
- 1 a 30: Prioridad baja
- 31 a 60: Prioridad media
- 61 a 80: Prioridad alta
- 81 a 100: Prioridad maxima

### Plantillas rapidas

| Plantilla | Dimensiones activas | Tipos de pedido | Caso de uso tipico |
|-----------|--------------------|-----------------|--------------------|
| Logistica Tradicional | Peso, Volumen | Desactivado | Empresas de courier, paqueteria, distribucion general |
| Productos de Alto Valor | Valorizado | Activado | Electronica, joyeria, farmacia, valores |
| Entrega Simple | Unidades | Desactivado | Delivery de comida, documentos, paquetes estandar |
| Completo | Peso, Volumen, Valorizado, Unidades | Activado | Operaciones complejas que requieren control total |

### Otras acciones

| Accion | Descripcion |
|--------|-------------|
| Guardar | Persiste los cambios del perfil. Solo se habilita cuando hay modificaciones pendientes. |
| Restablecer a valores predeterminados | Elimina el perfil personalizado y vuelve a la configuracion por defecto (peso y volumen). Solo disponible si existe un perfil personalizado. |
| Descargar Plantilla CSV | Genera y descarga una plantilla de importacion de pedidos adaptada al perfil actual. Solo incluye las columnas relevantes. |

## Casos de uso

1. **Empresa de courier tradicional**: Activa peso y volumen. Sus vehiculos tienen capacidad limitada por espacio y carga. La plantilla "Logistica Tradicional" cubre este escenario de inmediato.

2. **Distribuidor de celulares y electronica**: Activa valorizado y tipos de pedido. Los vehiculos no se llenan por peso sino por el valor total que transportan (limite de seguro). Los pedidos urgentes de reposicion de stock reciben prioridad maxima.

3. **Empresa de delivery de alimentos**: Activa solo unidades. Cada pedido es una entrega estandar y lo que importa es la cantidad maxima de entregas que un repartidor puede hacer por ruta.

4. **Operador logistico multicliente**: Activa todas las dimensiones con la plantilla "Completo". Maneja clientes con diferentes necesidades y requiere el control mas granular posible sobre peso, volumen, valor y cantidad.

5. **Farmaceutica con productos controlados**: Activa valorizado y peso. Los medicamentos tienen restricciones tanto de peso como de valor asegurado. Habilita tipos de pedido para priorizar entregas urgentes de medicamentos criticos sobre reposiciones regulares.

## Cuando usarlo

- **Al dar de alta una nueva empresa**: Es el primer paso de configuracion. Define como se comportara toda la plataforma para esa empresa.
- **Cuando cambia el tipo de operacion**: Si una empresa que solo hacia courier ahora tambien distribuye productos de alto valor, debe actualizar su perfil para activar la dimension de valorizado.
- **Antes de la primera importacion masiva de pedidos**: La plantilla CSV se genera segun el perfil. Configurar el perfil primero asegura que la plantilla tenga las columnas correctas.
- **Cuando se necesita priorizar tipos de pedido**: Si la empresa quiere que los pedidos reprogramados tengan mayor prioridad que los nuevos, debe habilitar tipos de pedido y ajustar los deslizadores.
- **Al incorporar vehiculos con distintas capacidades**: El perfil determina que campos de capacidad aparecen en el formulario de vehiculos.

## Cuando NO usarlo

- **No cambiar el perfil con rutas en curso**: Modificar las dimensiones de capacidad mientras hay optimizaciones activas puede generar inconsistencias en los calculos. Completar las rutas del dia antes de hacer cambios.
- **No activar dimensiones que no se van a llenar**: Si se activa "Valorizado" pero los pedidos nunca incluyen valor monetario, el motor de optimizacion usara cero como valor, lo cual no aporta nada y puede confundir a los operadores al ver campos vacios.
- **No usar "Completo" por defecto**: Activar todas las dimensiones sin necesidad agrega complejidad innecesaria a los formularios y la importacion CSV. Usar solo las dimensiones que realmente restringen la operacion.
- **No modificar prioridades sin criterio operativo**: Los valores de prioridad afectan directamente el orden de las rutas. Cambiarlos sin entender el impacto puede resultar en entregas urgentes atendidas tarde.

## Relacion con otros modulos

### Pedidos
El perfil determina que campos aparecen en el formulario de creacion y edicion de pedidos. Si "Peso" esta desactivado, el campo de peso no se muestra. Lo mismo aplica para volumen, valorizado, unidades y tipo de pedido.

### Importacion CSV
La plantilla CSV que se descarga desde Configuracion se genera dinamicamente segun el perfil. Solo incluye las columnas de capacidad relevantes. Al importar pedidos por CSV, la validacion tambien se ajusta al perfil activo.

### Vehiculos
El formulario de vehiculos muestra solo los campos de capacidad que coinciden con el perfil. Si la empresa usa peso y volumen, el formulario pedira capacidad de peso y capacidad de volumen. Si usa valorizado, pedira capacidad maxima de valor.

### Optimizacion de rutas
Este es el modulo mas impactado. El motor de optimizacion (VROOM) utiliza el perfil para:
- Construir arrays de capacidad multidimensional para vehiculos y pedidos.
- Asegurar que las dimensiones coincidan entre la demanda (pedidos) y la oferta (vehiculos).
- Aplicar prioridades por tipo de pedido, influyendo en el orden de visita.

Si no existe un perfil personalizado, el motor usa valores predeterminados (peso y volumen).

### Planificacion
El modulo de planificacion carga el perfil de la empresa para pasarlo al motor de optimizacion. Tambien lo utiliza para mostrar informacion de capacidad en los dialogos de configuracion de cada corrida de optimizacion.
