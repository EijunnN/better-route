# Presets de Optimizacion

## Que es

Los Presets de Optimizacion son configuraciones predefinidas que determinan como el sistema calcula y genera las rutas de reparto. Cada preset agrupa un conjunto de parametros (opciones de balanceo, restricciones de distancia, comportamiento de vehiculos, factor de trafico, etc.) que el motor de optimizacion utiliza al momento de planificar las rutas. Al tener presets guardados, la empresa puede ejecutar optimizaciones de forma consistente sin tener que configurar los parametros manualmente cada vez.

## Como funciona

1. **Acceso**: Desde el menu lateral, en la seccion "Configuracion", seleccionar "Presets Optimizacion".
2. **Vista principal**: Se muestra una grilla de tarjetas donde cada tarjeta representa un preset. Cada tarjeta muestra el nombre, la descripcion, las opciones activas (balancear visitas, minimizar vehiculos, ventanas flexibles), los parametros numericos (distancia maxima, tiempo de recarga, factor de trafico) y el modo de finalizacion de ruta.
3. **Crear un preset**: Presionar el boton "Nuevo Preset". Se abre un formulario donde se completan el nombre, la descripcion, las opciones de optimizacion (toggles ON/OFF), los parametros con sliders y el punto de finalizacion de las rutas.
4. **Editar un preset**: Presionar el boton "Editar" en la tarjeta del preset. Se abre el mismo formulario precargado con los valores actuales.
5. **Preset activo (predeterminado)**: Solo un preset puede estar marcado como "Activo" a la vez. El preset activo se aplica automaticamente cada vez que se ejecuta una optimizacion de rutas. Para activar un preset, se puede usar el boton de estrella en la tarjeta o activar la opcion "Establecer como predeterminado" dentro del formulario de edicion.
6. **Eliminar un preset**: Presionar el icono de papelera en la tarjeta. Se solicita confirmacion antes de proceder. La eliminacion es logica (el preset se desactiva, no se borra fisicamente).

Los presets son especificos de cada empresa. Cada empresa tiene su propio conjunto de presets independiente.

## Para que sirve

- **Estandarizar la planificacion**: Garantiza que todas las optimizaciones de rutas sigan los mismos criterios definidos por la empresa, eliminando variaciones por configuracion manual.
- **Agilizar la operacion diaria**: El planificador no necesita ajustar parametros cada vez que genera rutas. Solo ejecuta la optimizacion y el preset activo se aplica automaticamente.
- **Experimentar con diferentes estrategias**: La empresa puede crear multiples presets con distintas configuraciones (por ejemplo, uno que priorice menor distancia y otro que priorice balanceo de carga) y alternar entre ellos segun la necesidad del dia.
- **Adaptarse a distintos escenarios operativos**: Diferentes dias o temporadas pueden requerir diferentes configuraciones. Tener presets preparados permite cambiar de estrategia rapidamente.

## En que ayuda

- **Reduce errores humanos**: Al tener los parametros pre-configurados, se evitan errores por olvido o configuracion incorrecta al momento de optimizar.
- **Ahorra tiempo**: Pasar de configurar manualmente 15+ parametros a simplemente seleccionar un preset y ejecutar.
- **Mejora la calidad de las rutas**: Permite afinar los parametros con el tiempo y guardar las mejores configuraciones para reutilizarlas.
- **Facilita la gestion multi-equipo**: Diferentes supervisores pueden usar el mismo preset activo, asegurando consistencia en la planificacion sin importar quien la ejecute.
- **Permite comparar resultados**: Al tener presets con distintas estrategias, la empresa puede comparar los resultados de optimizacion y elegir la configuracion optima para su tipo de operacion.

## Opciones de configuracion

### Informacion basica

| Campo | Descripcion | Requerido |
|-------|-------------|-----------|
| Nombre | Nombre identificador del preset (por ejemplo: "Optimizacion estandar", "Reparto express") | Si |
| Descripcion | Texto libre para describir el proposito o las condiciones de uso del preset | No |
| Predeterminado | Indica si este es el preset que se aplica automaticamente en nuevas optimizaciones. Solo un preset puede ser predeterminado a la vez | No |

### Opciones de optimizacion (toggles ON/OFF)

| Opcion | Descripcion | Valor por defecto |
|--------|-------------|-------------------|
| Balancear visitas | Distribuye las paradas de forma equitativa entre los vehiculos disponibles, evitando que un vehiculo tenga muchas paradas y otro pocas | OFF |
| Minimizar vehiculos | El sistema intenta usar la menor cantidad de vehiculos posible, concentrando las paradas en menos rutas | OFF |
| Ventanas de tiempo flexibles | Permite cierta tolerancia en los horarios de entrega. Si esta desactivado, las ventanas de tiempo se respetan de forma estricta | OFF |
| Inicio abierto | Los vehiculos pueden iniciar su ruta desde cualquier ubicacion (no necesariamente desde el deposito) | OFF |
| Fin abierto | Los vehiculos no necesitan regresar al punto de origen al finalizar su ruta. La ruta termina en la ultima parada | OFF |
| Una ruta por vehiculo | Cada vehiculo solo tiene una ruta asignada. Desactivar esto permite que un vehiculo realice multiples rutas en el mismo dia | ON |
| Agrupar mismas coordenadas | Cuando hay multiples pedidos en la misma ubicacion (mismo edificio, misma direccion), se cuentan como una sola parada en la ruta | ON |

### Parametros numericos

| Parametro | Descripcion | Rango | Valor por defecto |
|-----------|-------------|-------|-------------------|
| Distancia maxima por ruta | Limite maximo en kilometros que un vehiculo puede recorrer en una sola ruta | 50 - 500 km | 200 km |
| Tiempo de recarga del vehiculo | Tiempo en minutos que el vehiculo necesita para recargarse o reabastecerse entre rutas (relevante para vehiculos electricos o con capacidad limitada de combustible) | 0 - 120 min | 0 min |
| Factor de trafico | Porcentaje de ajuste que el sistema aplica para considerar condiciones de trafico. Un valor mas alto indica mayor congestion esperada, lo que resulta en rutas mas cortas en distancia | 0 - 100% | 50% |

### Punto de finalizacion de rutas

| Modo | Descripcion |
|------|-------------|
| Origen del conductor | Cada ruta termina en el mismo lugar donde inicio el conductor. Es el modo mas comun para flotas que operan desde bases distribuidas |
| Depot especifico | Todas las rutas terminan en un punto fijo definido por coordenadas (latitud, longitud) y opcionalmente una direccion. Util cuando todos los vehiculos deben regresar a un almacen central |
| Fin abierto | Las rutas terminan en la ultima parada de entrega. No se calcula un tramo de retorno |

Cuando se selecciona "Depot especifico", se habilitan campos adicionales:

| Campo | Descripcion |
|-------|-------------|
| Latitud | Coordenada de latitud del punto final (ejemplo: -12.0464) |
| Longitud | Coordenada de longitud del punto final (ejemplo: -77.0428) |
| Direccion | Texto descriptivo de la direccion del depot final (opcional) |

### Opciones internas del motor (configuradas por defecto)

Estas opciones se aplican internamente y generalmente no requieren ajuste manual:

| Opcion | Descripcion | Valor por defecto |
|--------|-------------|-------------------|
| Merge similar | Combina rutas similares para mejorar la eficiencia global | ON |
| Simplify | Simplifica la solucion eliminando redundancias | ON |
| Big VRP | Habilita el modo de optimizacion para grandes volumenes de pedidos | ON |
| Merge by distance | Combina paradas cercanas basandose en la distancia entre ellas | OFF |
| Merge similar V2 | Version avanzada del algoritmo de combinacion de rutas | OFF |

## Casos de uso

### 1. Empresa de e-commerce con reparto urbano
La empresa opera en una ciudad con alto trafico. Configura un preset con factor de trafico al 80%, distancia maxima de 80 km, balanceo de visitas activado y ventanas de tiempo flexibles. Esto genera rutas mas cortas y equilibradas que respetan aproximadamente los horarios comprometidos con los clientes.

### 2. Distribucion de alimentos perecederos
La empresa necesita entregas rapidas y puntuales. Configura un preset con minimizar vehiculos desactivado, ventanas de tiempo flexibles desactivadas (para respetar horarios estrictos), distancia maxima baja (60 km) y factor de trafico al 70%. Las rutas resultantes son cortas y con horarios exactos.

### 3. Operacion de ultima milla con flota electrica
La empresa tiene vehiculos electricos con autonomia limitada. Configura un preset con distancia maxima de 120 km, tiempo de recarga de 45 minutos, una ruta por vehiculo activado y fin de ruta en depot especifico (estacion de carga). Esto asegura que los vehiculos no excedan su autonomia y regresen a cargar.

### 4. Courier con conductores independientes
La empresa trabaja con conductores que salen de distintos puntos de la ciudad. Configura un preset con inicio abierto activado, fin abierto activado y balanceo de visitas activado. Cada conductor recibe una cantidad similar de paradas y no necesita ir al deposito ni al inicio ni al final.

### 5. Gran distribuidor con operacion regional
La empresa cubre una region amplia con depositos multiples. Configura un preset con distancia maxima de 400 km, factor de trafico al 30% (rutas interurbanas con poco trafico), minimizar vehiculos activado y modo de fin de ruta en origen del conductor. Maximiza la cobertura con la menor cantidad de vehiculos posible.

## Cuando usarlo

- **Al comenzar a usar la plataforma**: Crear al menos un preset con los valores por defecto y ajustar segun los resultados de las primeras optimizaciones.
- **Cuando cambian las condiciones operativas**: Si la empresa adquiere vehiculos electricos, cambia de zona de operacion, o modifica sus compromisos de horario con los clientes.
- **Antes de temporadas altas**: Preparar presets especificos para periodos de alta demanda (por ejemplo, un preset con minimizar vehiculos desactivado y balanceo activado para distribuir mejor la carga).
- **Al incorporar nuevos tipos de servicio**: Si la empresa agrega servicios de entrega express junto con entregas estandar, puede crear presets separados para cada tipo.
- **Cuando se quiere experimentar**: Crear presets alternativos para probar distintas estrategias de ruteo y comparar resultados antes de adoptar una configuracion definitiva.

## Cuando NO usarlo

- **No crear un preset para cada dia de la semana**: A menos que la operacion realmente varie significativamente entre dias, es mas practico tener 2-3 presets bien configurados que uno por cada situacion posible.
- **No ajustar parametros sin evaluar resultados**: Cambiar multiples opciones a la vez dificulta entender cual parametro tuvo impacto. Se recomienda ajustar un parametro a la vez y comparar resultados.
- **No usar presets como unica herramienta de mejora**: Los presets optimizan la configuracion del motor de ruteo, pero la calidad de las rutas tambien depende de la precision de las direcciones, la correcta asignacion de ventanas de tiempo y la disponibilidad real de vehiculos y conductores.
- **No confiar ciegamente en los valores por defecto**: Los valores por defecto son un punto de partida razonable, pero cada operacion tiene particularidades que requieren ajuste. Se recomienda revisar los resultados de las primeras optimizaciones y ajustar los presets en consecuencia.
- **No eliminar el preset activo sin tener otro listo**: Si se elimina el unico preset marcado como predeterminado, las proximas optimizaciones no tendran un preset de referencia y sera necesario configurar los parametros manualmente.

## Relacion con otros modulos

- **Planificacion de rutas**: El preset activo se aplica automaticamente cuando se ejecuta una optimizacion de rutas desde el modulo de planificacion. Los parametros del preset determinan como el motor de ruteo genera las rutas.
- **Vehiculos y conductores**: Las opciones de balanceo de visitas, minimizar vehiculos, una ruta por vehiculo y distancia maxima afectan directamente como se distribuye la carga entre los vehiculos y conductores disponibles.
- **Ventanas de tiempo**: La opcion "Ventanas de tiempo flexibles" interactua con las ventanas de tiempo configuradas en los pedidos. Si esta activada, el motor permite cierta tolerancia; si esta desactivada, los horarios se respetan de forma estricta.
- **Habilidades de vehiculos**: Las habilidades (skills) de los vehiculos se evaluan durante la optimizacion independientemente del preset. El preset controla el comportamiento general del motor, mientras que las habilidades determinan que vehiculos pueden atender que tipo de pedidos.
- **Perfil de empresa**: El perfil de empresa define las dimensiones de capacidad (peso, volumen, unidades) que se usan durante la optimizacion. El preset complementa estas configuraciones con los parametros de ruteo.
- **Motores de optimizacion**: Los presets son compatibles con los distintos motores de optimizacion disponibles en la plataforma (VROOM, PyVRP). Los parametros del preset se traducen automaticamente al formato que cada motor requiere.
