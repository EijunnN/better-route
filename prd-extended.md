Documento Unificado de Especificación de Producto
Sistema de Gestión Logística - Versión Completa
Histórico de Versiones
Versión	Fecha	Descripción	Autor
1.0	—	Documento PRD base	Equipo de Producto
1.1	—	Addendum con módulo de hora prometida y mejoras	Equipo de Producto
2.0	Enero 2025	Unificación y conversión a historias de usuario	MiniMax Agent
Introducción
Este documento establece la especificación completa y detallada del Sistema de Gestión Logística, un producto diseñado para transformar las operaciones de distribución y transporte desde procesos manuales hacia flujos de trabajo automatizados, optimizados y adaptables en tiempo real. El sistema aborda específicamente la optimización de rutas de distribución, la gestión eficiente de flotas de vehículos y conductores, y la capacidad de adaptación dinámica ante cambios operativos.

El propósito fundamental de este documento es proporcionar una guía técnica y funcional exhaustiva que elimine cualquier ambigüedad en el proceso de desarrollo. Cada componente del sistema, sus interacciones, casos de uso y comportamientos esperados están definidos con precisión, actuando como contrato entre los stakeholders del proyecto y el equipo de desarrollo. Esta comprensión compartida de requisitos y expectativas es esencial antes de iniciar cualquier implementación.

La visión del Sistema de Gestión Logística es convertirse en la plataforma de referencia para la optimización de operaciones logísticas en empresas de distribución y transporte. El valor diferencial radica en su capacidad para combinar tres pilares esenciales: la optimización algorítmica de rutas utilizando motores especializados como VROOM, la gestión integral de flotas y recursos humanos con atributos y habilidades específicas, y la flexibilidad operativa para adaptarse a cambios inesperados sin comprometer la eficiencia general del plan de distribución.

El alcance del MVP se define cuidadosamente para incluir únicamente las funcionalidades esenciales que demuestren el valor central del producto mientras se mantiene un alcance manejable para el equipo de desarrollo. El MVP debe demostrar la capacidad de tomar información de planificación en formato CSV, procesarla a través de algoritmos de optimización, generar rutas óptimas, y producir archivos de salida que indiquen las asignaciones de cada conductor para su ejecución.

Historias de Usuario
A continuación se presenta el sistema completo convertido en historias de usuario con descripciones detalladas, criterios de aceptación y estado de completitud.

Módulo 1: Gestión de Empresas y Configuración Multi-Tenant
Historia de Usuario 1.1: Creación y Gestión de Companies
Estado: Pendiente

Como administrador del sistema

Quiero crear y gestionar Companies (empresas inquilinas)

Para permitir que múltiples organizaciones operen de manera aislada dentro de la misma plataforma

Descripción Detallada:

El sistema debe permitir a los administradores crear organizaciones que utilizarán la plataforma de manera independiente. Cada Company representa un tenant completamente aislado que mantiene sus propios datos de flotas, vehículos, conductores, planificaciones y configuraciones. Esta separación es fundamental para el modelo de negocio del sistema, permitiendo servir a múltiples clientes desde una única infraestructura mientras se garantiza la confidencialidad de los datos de cada organización.

La creación de una Company debe incluir la especificación de nombre legal que aparecerá en documentos oficiales y reportes, información de contacto incluyendo correo electrónico principal y teléfono para notificaciones del sistema, configuración regional que determinará formatos de fecha, zona horaria y preferencias culturales, y preferencias de negocio específicas como métricas de rendimiento objetivo y políticas de reasignación predeterminadas.

El sistema debe validar que los nombres de Company sean únicos dentro de la plataforma y que la información de contacto sea válida antes de permitir la creación. Una vez creada, la Company no puede eliminarse completamente, solo desactivarse para mantener la integridad histórica de los datos y prevenir pérdida accidental de información.

Criterios de Aceptación:

El formulario de creación de Company debe incluir campos para nombre legal, nombre comercial, correo electrónico de contacto, teléfono, dirección fiscal, país, zona horaria, moneda principal y formato de fecha
El sistema debe validar unicidad del nombre legal antes de permitir la creación
La validación de correo electrónico debe verificar formato válido y rechazarse si ya existe en otra Company activa
Cada Company debe recibir un identificador único automático generado por el sistema
La desactivación de una Company debe marcar todos sus datos como inactivos sin eliminar físicamente los registros
El sistema debe generar un evento de auditoría registro la creación y cualquier modificación posterior
La API debe permitir consulta de Companies con filtrado por estado, país o fecha de creación
Historia de Usuario 1.2: Aislamiento de Datos entre Companies
Estado: Pendiente

Como desarrollador

Quiero implementar el aislamiento de datos a nivel de base de datos

Para garantizar que cada Company solo pueda acceder a sus propios datos

Descripción Detallada:

El sistema debe implementar un mecanismo robusto de aislamiento de datos que garantice que ninguna Company pueda acceder, modificar o consultar información de otra organización. Este aislamiento debe funcionar en múltiples niveles: a nivel de base de datos mediante esquemas separados o columnas de tenant en cada tabla, a nivel de API mediante verificación automática del tenant asociado a la sesión del usuario, y a nivel de aplicación mediante validación antes de cualquier operación de lectura o escritura.

Cada usuario del sistema debe estar asociado a una única Company, y todas sus acciones deben filtrarse automáticamente según esta asociación. Los administradores de una Company no deben poder ver usuarios, flotas o datos de otras Companies incluso si conocen los identificadores de esos recursos. Cualquier intento de acceder a recursos de otro tenant debe resultar en error de autorización sin revelar la existencia de dichos recursos.

La implementación debe ser transparente para la lógica de negocio, evitando que los desarrolladores tengan que recordar manualmente agregar filtros de tenant en cada consulta. El patrón recomendado es utilizar middleware que automatice la inclusión del filtro de tenant en todas las operaciones de base de datos.

Criterios de Aceptación:

Cada tabla del sistema debe incluir una columna tenantId que identifique la Company propietaria
Todas las consultas a base de datos deben incluir automáticamente un filtro por tenantId de la sesión actual
Los endpoints de API deben rechazar solicitudes que intenten acceder a recursos de otro tenant
Los logs de auditoría deben registrar tanto el tenant como el usuario que realiza cada operación
Las migraciones de base de datos deben preservar el tenantId de cada registro
El sistema debe manejar correctamente el caso de un usuario que cambia de Company, reasignando sus datos apropiadamente
Módulo 2: Gestión de Flotas
Historia de Usuario 2.1: Creación y Configuración de Flotas
Estado: Pendiente

Como administrador de flota

Quiero crear y configurar flotas con información detallada

Para organizar vehículos y conductores bajo una gestión común

Descripción Detallada:

El sistema debe permitir a los administradores crear flotas que representen grupos lógicos de vehículos y conductores operando bajo gestión común. Cada flota puede pertenecer a la Company principal del sistema o representar una tercera empresa con la cual se mantienen relaciones comerciales, habilitando escenarios de subcontratación y colaboración entre organizaciones.

La creación de una flota requiere especificar un nombre descriptivo que identifique claramente el propósito de la flota, el tipo de flota que determina las características operativas estándar como vehículos de carga pesada, vans de reparto o vehículos ligeros, la empresa propietaria que puede ser la Company principal o una tercera empresa registrada en el sistema, y la configuración de capacidades estándar incluyendo peso máximo agregado y volumen máximo agregado permitidos.

Los horarios de operación definen cuándo la flota puede realizar entregas, con valores predeterminados que pueden ajustarse según las necesidades operativas. Por ejemplo, una flota de reparto urbano podría operar de 08:00 a 22:00, mientras que una flota de mensajería exprés podría operar las 24 horas.

El sistema debe validar que todos los campos requeridos estén completos antes de permitir la creación, y debe proporcionar mensajes de error claros cuando la validación falle. Los cambios en atributos críticos de flota deben registrar el valor anterior, el nuevo valor, el momento del cambio y el usuario que realizó la modificación.

Criterios de Aceptación:

El formulario de creación de flota debe incluir campos para nombre, tipo de flota, empresa propietaria, capacidad de peso predeterminada, capacidad de volumen predeterminada, hora de inicio de operación, hora de fin de operación, y estado activo
El sistema debe validar que el nombre sea único dentro de la Company y que las capacidades sean valores positivos
Los tipos de flota disponibles deben ser configurables pero incluir opciones estándar como carga pesada, carga ligera, express, refrigerado y especial
La desactivación de una flota debe requerir confirmación si tiene vehículos o conductores activos asignados
El sistema debe mantener historial completo de cambios en atributos críticos de flota
La API debe permitir consultar flotas con filtros por empresa propietaria, tipo de flota, estado operativo y fecha de creación
Historia de Usuario 2.2: Asociación de Vehículos a Flotas
Estado: Pendiente

Como administrador de flota

Quiero asignar vehículos a flotas específicas

Para organizar la flota vehicular bajo estructuras de gestión definidas

Descripción Detallada:

Cada vehículo del sistema debe pertenecer a una única flota, estableciendo una relación que determina qué conductor puede operar el vehículo según las reglas de asignación configuradas. La asociación de vehículos a flotas es fundamental para la planificación de rutas, ya que la optimización considera únicamente los vehículos disponibles en las flotas seleccionadas.

Cuando un vehículo se asigna a una flota, el sistema debe verificar que las características del vehículo sean compatibles con la configuración de la flota. Por ejemplo, si una flota está configurada exclusivamente para vehículos refrigerados, un vehículo sin esta capacidad no debería poder asignarse sin una excepción justificada.

La reasignación de vehículos entre flotas debe manejar correctamente las planificaciones en curso. Si un vehículo tiene rutas asignadas que aún no se han ejecutado, el sistema debe presentar opciones como completar las rutas actuales antes de la reasignación o transferir las asignaciones a otro vehículo de la flota original.

Criterios de Aceptación:

Cada vehículo debe tener un campo fleetId que referencia la flota a la que pertenece
El sistema debe validar la compatibilidad entre las características del vehículo y la configuración de la flota
La reasignación de vehículo a otra flota debe presentar opciones cuando hay planificaciones activas
El historial de cambios de flota debe mantenerse para cada vehículo con timestamps y usuario responsable
La consulta de vehículos debe permitir filtrar por flota y mostrar el conteo de vehículos por estado
La API debe incluir endpoint para obtener todos los vehículos de una flota específica
Historia de Usuario 2.3: Asociación de Conductores a Flotas
Estado: Pendiente

Como administrador de flota

Quiero asignar conductores a flotas específicas

Para organizar el personal de conducción bajo estructuras de gestión definidas

Descripción Detallada:

Cada conductor debe pertenecer a una flota específica que determina qué vehículos puede conducir según sus licencias y habilidades, y bajo qué supervisor operativo realiza su trabajo diario. La asociación conductor-flota es crítica para el proceso de optimización, ya que el algoritmo solo considerará conductores disponibles en las flotas seleccionadas para la planificación.

Los conductores pueden tener relaciones con múltiples flotas en escenarios de subcontratación o trabajo compartido. En estos casos, se define una flota primaria que es la empleadora principal del conductor y flotas secundarias donde puede realizar entregas cuando se requiera capacidad adicional. El sistema debe manejar correctamente la disponibilidad del conductor considerando sus compromisos con todas las flotas asociadas.

La información de disponibilidad del conductor por día y hora permite configurar turnos regulares, días de descanso y restricciones horarias. Esta información se utiliza durante la optimización para verificar que los conductores asignados a rutas estén disponibles en los horarios programados.

Criterios de Aceptación:

Cada conductor debe tener un campo fleetId que referencia su flota primaria
El sistema debe soportar flotas secundarias mediante una tabla de relación many-to-many
La disponibilidad del conductor debe configurarse por día de la semana con rangos horarios
Los días de descanso programados deben marcarse como no disponibles automáticamente
La consulta de conductores debe permitir filtrar por flota y mostrar disponibilidad actual
La API debe incluir endpoint para obtener conductores disponibles de una flota en un horario específico
Módulo 3: Gestión de Vehículos
Historia de Usuario 3.1: Registro de Vehículos con Atributos Completos
Estado: Pendiente

Como administrador de flota

Quiero registrar vehículos con todas sus características físicas y capacidades

Para tener información completa para la optimización de rutas

Descripción Detallada:

El sistema debe proporcionar capacidades completas de registro de vehículos, capturando tanto características físicas como capacidades operacionales necesarias para la optimización. Cada registro de vehículo representa un activo físico de la flota con información detallada que permite al sistema evaluar su idoneidad para diferentes tipos de entregas.

Los atributos físicos incluyen marca del fabricante, modelo específico, año de fabricación, matrícula o número de placa que identifica el vehículo legalmente, tipo de vehículo que clasifica el activo según su configuración como furgoneta, camión ligero, camión pesado, o vehículo refrigerado, capacidad de carga medida en kilogramos que representa el peso máximo que el vehículo puede transportar de manera segura, capacidad de volumen medida en litros que representa el espacio de carga disponible, y dimensiones del compartimento de carga incluyendo largo, ancho y alto para verificar compatibilidad con los tamaños de carga.

Las habilidades o capacidades especiales del vehículo se modelan como características booleanas que indican la presencia de equipamiento específico. Estas incluyen refrigeración para cargas que requieren temperatura controlada, calefacción para productos termosensibles en clima frío, elevación de carga mediante equipo mecánico integrado, y tipo de licencia requerida para operar el vehículo.

El sistema debe validar que los datos requeridos estén completos antes de permitir el registro y que las matrículas sean únicas dentro de la Company. Los cambios en atributos críticos como capacidad o estado operativo deben registrar el valor anterior, el nuevo valor, el momento del cambio y el usuario que realizó la modificación.

Criterios de Aceptación:

El formulario de registro debe incluir campos para matrícula, marca, modelo, año, tipo de vehículo, capacidad de peso en kg, capacidad de volumen en litros, longitud, anchura, altura, refrigerado, calentado, elevación de carga, tipo de licencia requerida, número de seguro, fecha de vencimiento de inspección, y estado operativo
El sistema debe validar unicidad de matrícula dentro de la Company
Las capacidades de peso y volumen deben ser valores positivos mayores a cero
Los tipos de licencia deben corresponder a categorías válidas del país de operación
Las fechas de vencimiento de documentos deben generar alertas cuando se aproximan
El sistema debe mantener historial de cambios para todos los atributos del vehículo
La API debe permitir consultar vehículos con filtros por tipo, estado operativo, capacidades y flota
Historia de Usuario 3.2: Gestión del Estado Operativo de Vehículos
Estado: Pendiente

Como administrador de flota

Quiero gestionar el estado operativo de vehículos

Para controlar qué vehículos están disponibles para nuevas planificaciones

Descripción Detallada:

El sistema debe permitir cambiar el estado operativo de cada vehículo para reflejar su disponibilidad real para operaciones de distribución. Los estados posibles incluyen disponible para indicar que el vehículo está operativo y listo para asignación a nuevas rutas, en mantenimiento para indicar que el vehículo está temporalmente fuera de servicio por reparaciones o mantenimiento preventivo, asignado para indicar que el vehículo ya tiene una ruta planificada y confirmada, e inactivo para indicar que el vehículo ha sido dado de baja permanentemente pero se mantiene en el sistema por razones históricas.

La transición de estado debe seguir reglas específicas para mantener la integridad operativa. Un vehículo no puede marcarse como disponible si tiene rutas confirmadas pendientes de ejecución. Un vehículo no puede marcarse como inactivo si tiene rutas activas o programadas. El sistema debe presentar opciones de reasignación cuando la transición de estado afecta planificaciones existentes.

El historial de cambios de estado debe mantenerse para cada vehículo, permitiendo análisis de utilización de la flota, identificación de patrones de mantenimiento y evaluación de disponibilidad. Este historial también es valioso para auditorías y cumplimiento regulatorio.

Criterios de Aceptación:

El sistema debe definir estados de vehículo: DISPONIBLE, EN_MANTENIMIENTO, ASIGNADO, INACTIVO
Las transiciones de estado deben seguir reglas predefinidas que eviten estados inválidos
El sistema debe rechazar intentos de desactivar vehículos con rutas confirmadas pendientes
Los intentos de cambiar estado de vehículos con asignaciones activas deben presentar opciones de reasignación
El historial de cambios debe incluir timestamp, estado anterior, estado nuevo, usuario responsable y motivo opcional
La consulta de vehículos debe permitir filtrar por estado y mostrar métricas de utilización
La API debe incluir endpoint para obtener disponibilidad de vehículos en un rango de fechas
Historia de Usuario 3.3: Catálogo de Habilidades de Vehículos
Estado: Pendiente

Como administrador del sistema

Quiero gestionar un catálogo centralizado de habilidades que pueden asignarse a vehículos

Para mantener consistencia en la definición de capacidades especiales

Descripción Detallada:

El sistema debe mantener un catálogo de habilidades que define las capacidades especiales disponibles para vehículos y requeridas por diferentes tipos de servicios. Cada habilidad en el catálogo tiene un código único que se utiliza en las asignaciones, un nombre descriptivo para facilitar la selección en interfaces de usuario, una categoría que agrupa habilidades relacionadas como equipamiento de carga, condiciones de temperatura o certificaciones, y una descripción detallada que explica qué implica la habilidad.

Las habilidades pueden marcarse como requeridas o preferidas para diferentes tipos de servicios. Las habilidades requeridas son condiciones sine qua non que deben estar presentes en el vehículo para realizar el servicio, mientras que las habilidades preferidas son características deseables que mejoran la calidad del servicio pero no son obligatorias.

El catálogo de habilidades es editable por administradores del sistema, quienes pueden agregar nuevas habilidades según evolucionen los requisitos del negocio. Sin embargo, las habilidades que están actualmente en uso no pueden eliminarse, solo marcarse como inactivas para mantener la integridad de los datos históricos.

Criterios de Aceptación:

El catálogo debe permitir CRUD completo de habilidades con código único, nombre, categoría, descripción, indicador de activo, y timestamps
Las habilidades pueden organizarse en categorías como Equipamiento, Temperatura, Certificaciones y Especiales
Las habilidades marcadas como en uso no pueden eliminarse, solo desactivarse
La API debe permitir consultar habilidades por categoría y por estado activo
La asignación de habilidades a vehículos debe usar checkboxes o selector múltiple en la interfaz
El sistema debe validar que no existan duplicados de código de habilidad
Módulo 4: Gestión de Conductores
Historia de Usuario 4.1: Registro de Conductores con Información Completa
Estado: Pendiente

Como administrador de flota

Quiero registrar conductores con información personal y profesional completa

Para tener datos necesarios para asignación y cumplimiento legal

Descripción Detallada:

El sistema debe permitir mantener un registro completo de cada conductor, capturando información personal necesaria para contacto y localización, credenciales profesionales requeridas para el cumplimiento legal de regulaciones de transporte, y características operacionales que determinan qué rutas puede выполнять el conductor.

Los atributos personales incluyen nombre completo del conductor, número de identificación oficial como DNI o equivalente nacional, información de contacto incluyendo correo electrónico y teléfono móvil para notificaciones, fecha de nacimiento necesaria para verificación de mayoría de edad y cálculos de antigüedad, y fotografía reciente para identificación visual.

Los atributos profesionales incluyen número de licencia de conducir que autoriza la operación de vehículos, fecha de vencimiento de la licencia que es crítica para verificar validez antes de cada turno, categorías o clases de licencia que determinan qué tipos de vehículos puede conducir el conductor, y certificaciones especiales como manejo de materiales peligrosos, primeros auxilios, o capacitación en equipos especiales.

El sistema debe validar que las licencias estén vigentes antes de permitir asignaciones a rutas. Las licencias próximas a vencer deben generar alertas preventivas con suficiente anticipación para renovación. Los conductores con licencias vencidas deben marcarse automáticamente como no disponibles para nuevas asignaciones.

Criterios de Aceptación:

El formulario de registro debe incluir nombre completo, identificación, correo electrónico, teléfono, fecha de nacimiento, fotografía, número de licencia, fecha de vencimiento, categorías de licencia, certificaciones con fechas de vencimiento, y flota asignada
El sistema debe validar formato de identificación y licencia según el país de operación
Las licencias próximas a vencer en menos de 30 días deben generar alertas visuales
Los conductores con licencias vencidas deben marcarse automáticamente como NO_DISPONIBLE
La API debe permitir consultar conductores con filtros por flota, estado de licencia y certificaciones válidas
El sistema debe mantener historial de cambios en atributos críticos del conductor
Historia de Usuario 4.2: Gestión de Habilidades de Conductores
Estado: Pendiente

Como administrador de flota

Quiero asignar habilidades específicas a conductores

Para registrar competencias que determinan qué rutas puede realizar cada conductor

Descripción Detallada:

Las habilidades del conductor se modelan como una relación muchos a muchos con el catálogo de habilidades del sistema, permitiendo que cada conductor tenga un conjunto único de competencias que puede evolucionar con el tiempo. Esta flexibilidad es esencial ya que las habilidades de los conductores cambian con capacitación continua, renovación de certificaciones y desarrollo de experiencia.

Las habilidades incluyen idiomas hablados para servicios que requieren comunicación con clientes en idiomas específicos, certificaciones técnicas como manipulación de alimentos, equipos de carga especial o primeros auxilios, experiencia con tipos específicos de carga como materiales peligrosos, carga refrigerada o carga voluminosa, y capacidades físicas relevantes como capacidad de carga manual o trabajo en alturas.

Durante la optimización de rutas, el sistema verifica que cada conductor asignado tenga todas las habilidades requeridas por los pedidos de su ruta. Esta verificación es automática y blocking cuando se configura en modo estricto, o advisory cuando se configura en modo flexible permitiendo excepciones justificadas.

La expiración de certificaciones debe manejarse correctamente, marcando habilidades como vencidas cuando supera la fecha de vigencia. El sistema debe generar alertas cuando certificaciones están próximas a vencer para facilitar la renovación oportuna.

Criterios de Aceptación:

La asignación de habilidades a conductores debe usar el catálogo centralizado de habilidades
Las habilidades deben mostrar fecha de obtención y fecha de vencimiento cuando aplica
El sistema debe validar automáticamente habilidades vigentes antes de asignar conductor a rutas
Las certificaciones próximas a vencer en menos de 30 días deben generar alertas
Las habilidades vencidas deben excluirse automáticamente de la verificación de compatibilidad
La API debe permitir consultar conductores por habilidades específicas
La interfaz debe mostrar claramente qué habilidades tiene un conductor y cuáles están vigentes
Historia de Usuario 4.3: Gestión del Estado Operativo de Conductores
Estado: Pendiente

Como agente monitor

Quiero gestionar el estado operativo de conductores durante la ejecución

Para mantener visibilidad del progreso de rutas y detectar problemas tempranamente

Descripción Detallada:

El estado operativo del conductor es un atributo crítico que cambia frecuentemente durante la operación del sistema, reflejando su disponibilidad y progreso en las actividades asignadas. Los estados posibles incluyen disponible para indicar que el conductor no tiene asignación activa y puede recibir nuevas rutas, asignado para indicar que el conductor tiene una ruta confirmada pero aún no ha iniciado, en ruta para indicar que el conductor está ejecutando activamente su ruta asignada, en pausa para indicar que el conductor está en un período de descanso programado o no programado, completado para indicar que el conductor ha finished successfully todas las paradas de su ruta, no disponible para indicar que el conductor tiene restricciones temporales como licencia vencida o sanción disciplinaria, y ausente para indicar que el conductor no se presentó a su turno sin justificación.

Cuando un conductor no se presenta a su turno asignado, el sistema debe detectar esta situación y triggerear automáticamente el proceso de reasignación de rutas. La detección se basa en la comparación entre la hora programada de inicio de ruta y la hora actual, con una tolerancia configurable antes de declarar la ausencia.

El sistema debe registrar todas las transiciones de estado con timestamp preciso, actor que inició el cambio y contexto de la transición. Esta información es fundamental para métricas de rendimiento, análisis de puntualidad y auditorías de operación.

Criterios de Aceptación:

Los estados de conductor deben ser: DISPONIBLE, ASIGNADO, EN_RUTA, EN_PAUSA, COMPLETADO, NO_DISPONIBLE, AUSENTE
El sistema debe actualizar automáticamente el estado basado en acciones de planificación y ejecución
La ausencia de conductor debe detectarse automáticamente cuando supera el tiempo de tolerancia configurado
Las reasignaciones deben iniciarse automáticamente cuando se detecta un conductor ausente
Todas las transiciones de estado deben registrarse con timestamp, actor y contexto
La API debe permitir consultar el estado actual de todos los conductores de una flota
El dashboard de monitoreo debe mostrar claramente el estado de cada conductor activo
Módulo 5: Configuración de Ventanas de Tiempo
Historia de Usuario 5.1: Creación de Presets de Ventanas de Tiempo
Estado: Pendiente

Como planificador

Quiero crear presets reutilizables de ventanas de tiempo que definen horarios de entrega prometidos a clientes

Para acelerar la configuración de pedidos y mantener consistencia operativa

Descripción Detallada:

El módulo de hora prometida constituye uno de los pilares fundamentales de la experiencia del usuario final en el sistema logístico. Este módulo permite a los planificadores configurar con precisión los compromisos de entrega que se comunicarán a los clientes, estableciendo ventanas de tiempo específicas durante las cuales se garantiza la llegada de los pedidos. La configuración flexible de estas ventanas permite adaptar el sistema a diferentes modelos operativos, desde entregas en turnos amplios hasta compromisos horarios exactos que requieren precisión a nivel de minutos.

El sistema soporta tres modalidades principales de hora prometida. Los turnos representan ventanas de tiempo amplias que típicamente abarcan varias horas del día y se asocian a períodos de trabajo regulares de la operación logística. Un turno típico podría ser Mañana de 08:00 a 14:00, Tarde de 14:00 a 20:00, o Noche de 20:00 a 02:00. Los turnos son ideales para operaciones de distribución masiva donde la precisión exacta no es crítica pero se necesita organizar la capacidad de la flota en bloques manejables.

Los rangos representan ventanas de tiempo más específicas que los turnos, típicamente de dos a cuatro horas de duración. Un rango podría ser Entrega Preferente Mañana de 09:00 a 12:00 o Entrega Tarde Extendida de 16:00 a 20:00. Los rangos se utilizan cuando el negocio ofrece niveles de servicio diferenciados, donde clientes que pagan un premium reciben ventanas de entrega más reducidas.

Las horas exactas representan el nivel más alto de precisión, prometiendo la entrega en una hora específica del día. Este tipo de ventana se utiliza para entregas críticas donde el receptor necesita estar presente o donde la entrega anticipada podría causar problemas. La configuración de horas exactas permite especificar un margen de tolerancia configurable.

Criterios de Aceptación:

El sistema debe soportar tipos de preset: SHIFT (turno), RANGE (rango), EXACT (hora exacta)
Para SHIFT y RANGE se deben definir hora de inicio y hora de fin
Para EXACT se debe definir hora específica y tolerancia en minutos
Los presets deben tener nombre descriptivo único dentro de la Company
El sistema debe validar que las horas de fin sean posteriores a las de inicio
Los presets pueden marcarse como inactivos sin eliminar para mantener historial
La API debe permitir CRUD completo de presets con filtrado por tipo y estado
Historia de Usuario 5.2: Configuración de Estrictez de Ventanas de Tiempo
Estado: Pendiente

Como planificador

Quiero configurar si las ventanas de tiempo son restricciones hard o soft

Para controlar el comportamiento del algoritmo de optimización ante restricciones no cumplibles

Descripción Detallada:

El concepto de hora prometida se integra profundamente con el motor de optimización VROOM, funcionando como restricción hard o soft según la configuración del planificador. Cuando las restricciones de hora prometida se configuran como hard, el algoritmo de optimización rechazará cualquier asignación que viole la ventana de tiempo especificada, garantizando al usuario final la promesa comunicada. En modo soft, el sistema encuentra soluciones que minimizan los retrasos mientras intenta cumplir con las ventanas especificadas, permitiendo una mayor flexibilidad operativa a costa de posibles incumplimientos parciales.

La configuración de estrictez puede establecerse a nivel de preset de ventana de tiempo, aplicándose a todos los pedidos que usen ese preset, o a nivel de pedido individual, permitiendo excepciones justificadas para pedidos específicos. Esta flexibilidad permite mantener políticas generales estrictas mientras se maneja situaciones excepcionales sin comprometer toda la planificación.

El factor de penalización de retraso determina cuánto más costoso es un minuto de retraso comparado con un minuto adicional de conducción cuando se opera en modo soft. Un factor alto indica que el cumplimiento de horarios es prioritario sobre la eficiencia de ruta, mientras que un factor bajo trata los retrasos y la distancia de manera equivalente.

Criterios de Aceptación:

Cada preset de ventana de tiempo debe tener una configuración de estrictez predeterminada
Cada pedido debe permitir sobrescribir la estrictez del preset con un valor individual
En modo HARD, el algoritmo debe rechazar asignaciones que violen ventanas
En modo SOFT, el algoritmo debe minimizar retrasos con factor de penalización configurable
El sistema debe reportar cuántos pedidos quedaron sin asignar por restricciones hard
La interfaz debe mostrar claramente la configuración de estrictez de cada pedido
Las métricas de optimización deben incluir el nivel de incumplimiento de ventanas
Módulo 6: Importación de Pedidos
Historia de Usuario 6.1: Carga de Archivos CSV para Importación de Pedidos
Estado: Pendiente

Como planificador

Quiero cargar archivos CSV con datos de pedidos para su procesamiento

Para importar masivamente la información de entregas del sistema externo

Descripción Detallada:

El proceso de importación de datos se simplifica significativamente para el MVP, requiriendo únicamente un archivo CSV con los campos estrictamente necesarios para la operación. Esta simplificación reduce la fricción de adopción inicial mientras mantiene toda la información esencial para la planificación y optimización de rutas. El formato está diseñado para ser generado fácilmente desde sistemas ERP, hojas de cálculo, o bases de datos existentes.

El archivo CSV debe utilizar codificación UTF-8 para garantizar la correcta visualización de caracteres especiales en español, incluyendo acentos, la letra ñ, y otros caracteres específicos del idioma. El delimitador puede ser coma o punto y coma, detectándose automáticamente según el contenido de la primera línea.

Los campos requeridos del CSV incluyen track como identificador único del pedido con máximo 50 caracteres, direccion como dirección textual de entrega en texto libre, departamento como división administrativa nivel 1, provincia como división administrativa nivel 2, distrito como división administrativa nivel 3, latitud como coordenada geográfica en decimal con rango válido, y longitud como coordenada geográfica en decimal con rango válido.

Los campos opcionales incluyen hora_prometida en formato HH:MM-HH:MM o HH:MM para configuración directa de ventana, peso_kg como peso del pedido en kilogramos para optimización por capacidad, volumen_l como volumen del pedido en litros para optimización por capacidad, y skills_requeridas como lista separada por comas para validación de asignación.

Criterios de Aceptación:

El sistema debe aceptar archivos CSV con extensión .csv y codificación UTF-8
La detección automática de delimitador debe funcionar para coma y punto y coma
El archivo debe tener headers en la primera fila que el sistema mapea a campos
El sistema debe rechazar archivos sin campos requeridos con mensaje de error específico
La interfaz debe mostrar preview de los primeros registros antes de procesar
El procesamiento debe mostrar indicador de progreso para archivos grandes
La API debe recibir el contenido CSV como base64 y retornar resultado de importación
Historia de Usuario 6.2: Validación de Datos Durante Importación
Estado: Pendiente

Como planificador

Quiero que el sistema valide los datos del CSV antes de confirmar la importación

Para identificar y corregir errores antes de que afecten la planificación

Descripción Detallada:

El proceso de importación debe incluir validación exhaustiva de cada registro antes de confirmar la importación. Esta validación garantiza que solo datos válidos entren al sistema, previniendo errores en etapas posteriores del proceso de planificación.

La validación de coordenadas verifica que los valores de latitud estén en el rango de -90 a 90 grados y la longitud en el rango de -180 a 180 grados. Coordenadas en cero (0, 0) se marcan como sospechosas ya que corresponden al Golfo de Guinea y raramente son ubicaciones válidas de entrega. El sistema puede configurarse para rechazar o advertir sobre coordenadas sospechosas según la política de la empresa.

La validación de tracking ID garantiza que cada pedido tenga un identificador único en el sistema. Los intentos de importar pedidos con tracking IDs duplicados se rechazan con indicación de qué IDs están duplicados. La resolución de duplicados requiere intervención manual para determinar cuál registro debe conservarse.

La validación de ventanas de tiempo verifica que la hora de fin sea posterior a la hora de inicio y que la duración sea razonable. Para ventanas de tipo hora exacta, el sistema verifica que la tolerancia especificada sea razonable.

Los errores de procesamiento se capturan a nivel de registro individual, permitiendo que un archivo con algunos registros problemáticos pueda importarse parcialmente. Los registros con errores se excluyen de la inserción y se reportan al usuario con información suficiente para identificar y corregir el problema.

Criterios de Aceptación:

El sistema debe validar coordenadas dentro de rangos válidos de latitud y longitud
Coordenadas (0, 0) deben generar advertencia o rechazo configurable
Tracking IDs duplicados deben rechazarse con indicación de los IDs afectados
Campos requeridos faltantes deben marcarse como errores específicos por registro
El sistema debe generar reporte de errores con número de fila y tipo de error
Los registros válidos e inválidos deben separarse para facilitar corrección
La validación debe completarse antes de cualquier modificación en base de datos
Historia de Usuario 6.3: Mapeo de Columnas del CSV
Estado: Pendiente

Como planificador

Quiero mapear las columnas del archivo CSV a los campos del sistema

Para acomodar variaciones en los formatos de exportación de diferentes sistemas

Descripción Detallada:

El sistema debe proporcionar una interfaz de mapeo de columnas que permita al planificador especificar cómo las columnas del archivo CSV corresponden a los campos del modelo de datos del sistema. Esta funcionalidad es esencial para acomodar variaciones en los formatos de exportación de diferentes sistemas ERP o fuentes de datos.

La interfaz de mapeo presenta una tabla de preview con las primeras 10 filas del archivo, permitiendo al planificador verificar que los datos se leen correctamente. Debajo de cada columna del archivo se muestra un selector que permite elegir el campo correspondiente del sistema. Por defecto, el sistema intenta detectar el mapeo basándose en nombres de columna similares, pero el planificador puede ajustar manualmente si la detección no es correcta.

Los selectores de mapeo incluyen validación que impide avanzar si algún campo requerido no está mapeado. Los campos mapeados se marcan visualmente como completados, y el sistema proporciona feedback claro sobre el estado del mapeo antes de proceder al procesamiento.

Criterios de Aceptación:

La interfaz debe mostrar preview de datos con los headers del archivo
Cada columna del archivo debe tener un selector de campo destino en el sistema
El sistema debe intentar autocompletar el mapeo basado en nombres de columna similares
Los campos requeridos sin mapeo deben marcarse claramente como faltantes
El avance debe bloquearse hasta que todos los campos requeridos estén mapeados
La configuración de mapeo debe poder guardarse como plantilla para reutilización
La API debe recibir el mapeo de columnas como parte de la solicitud de importación
Historia de Usuario 6.4: Geocodificación y Priorización de Coordenadas
Estado: Pendiente

Como planificador

Quiero que el sistema procese las coordenadas del CSV para visualización en mapa

Para verificar visualmente la distribución geográfica de los pedidos importados

Descripción Detallada:

La visualización de los puntos importados en el mapa constituye un componente crítico de la experiencia de usuario, proporcionando contexto geográfico inmediato que facilita la comprensión de los datos importados y la toma de decisiones de planificación. El sistema utiliza MapLibre GL JS para renderizar mapas interactivos con rendimiento optimizado para grandes volúmenes de puntos.

La lógica de priorización de coordenadas es estricta: cuando un registro del CSV contiene coordenadas válidas, estas coordenadas se utilizan directamente para posicionar el marcador en el mapa. La dirección textual se almacena como referencia pero no se utiliza para geocodificación ni posicionamiento. Esta aproximación garantiza que la ubicación mostrada sea exactamente la especificada en los datos, evitando las imprecisiones comunes de los servicios de geocodificación que pueden desplazar una dirección varios kilómetros de su ubicación real.

Los marcadores en el mapa utilizan un sistema de color codificado según el estado del pedido. Los puntos grises representan pedidos sin asignar, puntos amarillos indican pedidos asignados a rutas pero no completados, puntos verdes marcan pedidos entregados exitosamente, y puntos rojos señalan errores o fallos de entrega. Al pasar el mouse sobre un marcador, un tooltip muestra la información clave del pedido.

El rendimiento de renderizado se optimiza utilizando clustering para grandes volúmenes de puntos cuando el zoom del mapa muestra áreas muy saturadas. Los clusters se representan como círculos con un número que indica cuántos puntos contiene.

Criterios de Aceptación:

El sistema debe usar coordenadas del CSV directamente cuando son válidas
Los marcadores deben usar código de colores por estado del pedido
El tooltip al pasar mouse debe mostrar tracking ID, dirección y estado
El clustering debe activarse automáticamente cuando hay muchos puntos cercanos
Click en cluster debe hacer zoom para separar puntos individuales
El rendimiento debe ser fluido con miles de puntos en el mapa
La API debe retornar datos GeoJSON para visualización en cliente
Módulo 7: Configuración de Optimización
Historia de Usuario 7.1: Configuración del Depot y Recursos Base
Estado: Pendiente

Como planificador

Quiero configurar la ubicación del depot y seleccionar vehículos y conductores disponibles

Para definir los recursos base sobre los cuales el algoritmo construirá las rutas

Descripción Detallada:

La configuración de flota define los recursos disponibles para ejecutar las rutas y el punto de partida común de todos los vehículos. Estos parámetros establecen el escenario base sobre el cual el algoritmo construye las rutas óptimas.

El depot representa la ubicación desde donde parten y a donde regresan todos los vehículos al final de sus rutas. El planificador especifica las coordenadas del depot mediante un selector de ubicación en el mapa o mediante entrada directa de coordenadas. Todas las rutas generadas incluirán el depot como primer y último punto automáticamente. El sistema valida que el depot tenga coordenadas válidas antes de permitir la ejecución de optimización.

Vehículos Disponibles: El planificador selecciona qué vehículos de la flota disponible se utilizarán en la optimización. El sistema muestra una lista de vehículos con sus características clave incluyendo matrícula, tipo, capacidad de peso y volumen, y habilidades disponibles. La selección puede realizarse individualmente o por grupos usando filtros por tipo de vehículo o flota. Los vehículos no seleccionados permanecen disponibles para asignaciones manuales posteriores.

Conductores Asignados: De manera similar a los vehículos, el planificador selecciona qué conductores participarán en la optimización automática. Los conductores seleccionados deben tener las habilidades requeridas por los pedidos pendientes y no deben tener restricciones activas como licencias vencidas o períodos de descanso obligatorios.

Criterios de Aceptación:

El selector de depot debe permitir ubicación por click en mapa o entrada directa de coordenadas
El sistema debe validar que el depot tenga coordenadas válidas antes de optimización
La lista de vehículos debe mostrar matrículas, tipo, capacidades y habilidades
La selección de vehículos debe permitir filtrado por tipo, flota y estado
La lista de conductores debe mostrar nombre, flota y habilidades disponibles
El sistema debe filtrar automáticamente conductores con licencias vencidas o restricciones
La API debe recibir configuración de recursos como parte del request de optimización
Historia de Usuario 7.2: Configuración de Capacidades y Restricciones
Estado: Pendiente

Como planificador

Quiero configurar las restricciones de capacidad de vehículos y habilidades requeridas

Para asegurar que las rutas generadas sean físicamente realizables

Descripción Detallada:

La configuración de capacidades define los límites operativos de los vehículos y las restricciones que el algoritmo debe respetar al construir las rutas. Estos parámetros son críticos para garantizar que las rutas generadas sean físicamente realizables.

Capacidad Volumétrica: Cada vehículo tiene un límite de volumen de carga que no puede excederse. El planificador puede configurar si la optimización considera estas capacidades o si las ignora. Para el modo capacitado, el sistema suma el volumen declarado de cada pedido y rechaza asignaciones que harían que el total supere la capacidad del vehículo.

Capacidad de Peso: Similar al volumen, el peso total de los pedidos asignados a un vehículo no puede exceder su capacidad de carga nominal. El sistema valida tanto volumen como peso simultáneamente, requiriendo que ambos límites se respeten para que una asignación sea válida.

Habilidades Requeridas: Los pedidos pueden especificar habilidades requeridas que el vehículo o conductor debe poseer. Durante la optimización, el sistema filtra automáticamente los vehículos y conductores que no cumplen con los requisitos de cada pedido.

Criterios de Aceptación:

El sistema debe ofrecer modo capacitado y no capacitado para optimización
En modo capacitado, el algoritmo debe respetar límites de peso y volumen por vehículo
El sistema debe verificar habilidades requeridas contra capacidades de vehículo y conductor
Los vehículos sin habilidades suficientes para un pedido deben excluirse automáticamente
La interfaz debe mostrar resumen de pedidos pendientes con requerimientos de capacidad
La API debe permitir configurar qué restricciones considerar durante optimización
Las métricas de optimización deben indicar capacidad utilizada por ruta
Historia de Usuario 7.3: Configuración de Tiempo y Ventanas de Entrega
Estado: Pendiente

Como planificador

Quiero configurar parámetros temporales incluyendo ventana de trabajo y respeto a horas prometidas

Para balancear cumplimiento de horarios con eficiencia operativa

Descripción Detallada:

La configuración de tiempo determina cómo el algoritmo maneja las restricciones temporales incluyendo las ventanas de tiempo prometidas a los usuarios finales y los límites de trabajo de los conductores.

Ventana de Trabajo de Flota: Define el rango horario durante el cual los vehículos pueden operar. Todos los pedidos deben programarse dentro de esta ventana global. El planificador especifica la hora de inicio y fin de la jornada operativa.

Tiempo de Servicio por Stop: Estimación del tiempo promedio requerido para cada parada de entrega, incluyendo tiempo de desplazamiento desde el vehículo hasta el punto de entrega, tiempo de interacción con el receptor, y tiempo de retorno al vehículo. El valor predeterminado es 10 minutos pero puede ajustarse según la experiencia operativa.

Respeto de Hora Prometida: Controla el comportamiento del algoritmo cuando las ventanas de tiempo prometidas no pueden cumplirse estrictamente. En modo estricto, el algoritmo rechazará cualquier asignación que viole una ventana prometida. En modo flexible, el algoritmo encuentra rutas que minimicen los retrasos totales.

Criterios de Aceptación:

La ventana de trabajo debe especificarse con hora de inicio y fin
El tiempo de servicio debe ser configurable con valor predeterminado de 10 minutos
El modo de respeto a hora prometida debe ser seleccionable entre HARD y SOFT
En modo SOFT debe configurarse factor de penalización de retraso
El sistema debe verificar que todos los pedidos quepan en la ventana de trabajo
La API debe recibir todos los parámetros de tiempo en el request de optimización
Las métricas de resultado deben indicar nivel de cumplimiento de ventanas
Historia de Usuario 7.4: Configuración de Estrategia de Optimización
Estado: Pendiente

Como planificador

Quiero seleccionar el objetivo principal de optimización y parámetros avanzados

Para personalizar el comportamiento del algoritmo según prioridades del negocio

Descripción Detallada:

La configuración de estrategia define los objetivos prioritarios del algoritmo y cómo se balancean diferentes metas de optimización cuando entran en conflicto.

Prioridad de Objetivo: El planificador selecciona el objetivo principal de optimización. La opción Minimizar Distancia prioriza rutas más cortas en kilómetros, reduciendo costos de combustible y desgaste vehicular. La opción Minimizar Tiempo prioriza rutas más rápidas considerando condiciones de tráfico estimadas. La opción Balanceado busca un compromiso entre distancia y tiempo.

Factor de Penalización de Retraso: Cuando el modo de hora prometida es flexible, este parámetro controla cuánto penaliza el algoritmo los retrasos en las entregas. Un factor alto indica que un minuto de retraso es tan costoso como 10 minutos adicionales de conducción.

Número Máximo de Rutas: Límite en el número de rutas que el algoritmo puede generar. Este parámetro es útil cuando existen restricciones sobre el número de conductores disponibles.

Criterios de Aceptación:

El objetivo de optimización debe tener opciones: DISTANCIA, TIEMPO, BALANCEADO
El factor de penalización debe ser configurable con rango de 1x a 20x
El número máximo de rutas debe ser configurable con valor predeterminado infinito
La interfaz debe incluir descripción de cada parámetro para facilitar selección
Los presets de configuración deben permitir guardar configuraciones comunes
La API debe aceptar todos los parámetros de estrategia en el request
El sistema debe mostrar resumen de configuración antes de ejecutar optimización
Módulo 8: Ejecución de Optimización
Historia de Usuario 8.1: Ejecución Asíncrona de Optimización
Estado: Pendiente

Como planificador

Quiero ejecutar la optimización de rutas como proceso asíncrono

Para no bloquear la interfaz mientras se procesan planes grandes

Descripción Detallada:

La optimización de rutas mediante VROOM es un proceso computacionalmente intensivo que puede tomar tiempo significativo para planes grandes. El sistema debe manejar estos procesos de manera asíncrona con timeouts configurables para evitar que solicitudes individuales bloqueen recursos del servidor.

Cuando el planificador inicia la optimización, el sistema retorna inmediatamente un identificador de job que puede usarse para consultar el estado del procesamiento. El cliente debe hacer polling del endpoint de estado hasta que el job complete. Cuando el procesamiento completa, el resultado incluye las rutas generadas con sus métricas de calidad.

La concurrencia de optimizaciones debe controlarse para evitar sobrecarga del sistema. El sistema debe mantener una cola de trabajos de optimización con prioridades basadas en el usuario que inicia y la urgencia declarada. Cuando se alcanza el límite de concurrencia, trabajos adicionales permanecen en cola.

Los resultados de optimización deben cachearse cuando las entradas no han cambiado. Si el mismo set de pedidos y vehículos se optimiza múltiples veces con los mismos parámetros, el sistema debe poder retornar el resultado cacheado instantáneamente.

Criterios de Aceptación:

La API debe retornar job ID inmediatamente al iniciar optimización
El endpoint de estado debe permitir polling hasta completar o fallar
El sistema debe mantener cola de trabajos con control de concurrencia
Los timeouts deben ser configurables con valor predeterminado de 5 minutos
El resultado cacheado debe retornarse si las entradas no han cambiado
La interfaz debe mostrar indicador de progreso animado durante procesamiento
El usuario debe poder cancelar optimización en curso
Historia de Usuario 8.2: Visualización de Resultados de Optimización
Estado: Pendiente

Como planificador

Quiero ver las rutas generadas por la optimización con métricas detalladas

Para evaluar la calidad de la solución y decidir si confirmar o ajustar

Descripción Detallada:

Después de ejecutar la optimización, el sistema debe presentar los resultados de manera clara y comprensible para que el planificador pueda evaluar la calidad de la solución y tomar decisiones informadas sobre confirmación o ajustes.

Cada ruta generada debe mostrar el vehículo asignado, el conductor asignado si la optimización automática incluyó asignación, la secuencia de stops con tiempos de llegada estimados, las métricas de la ruta incluyendo distancia total, duración total y número de stops, y el cumplimiento de restricciones como ventanas de tiempo y capacidades.

Las rutas que tienen problemas potenciales, como ventanas de tiempo comprometidas o utilización baja de capacidad, deben marcarse con indicadores visuales que attiran la atención del planificador. El sistema debe proporcionar advertencias específicas sobre cualquier violación de restricciones que haya ocurrido en modo flexible.

El sistema debe también reportar los pedidos que no pudieron asignarse a ninguna ruta, indicando el motivo específico del rechazo como capacidad insuficiente, restricciones de habilidades o ventanas de tiempo incompatibles.

Criterios de Aceptación:

Cada ruta debe mostrar vehículo, conductor, stops, distancia, duración y métricas
Los conflictos de capacidad o ventanas deben marcarse con indicadores visuales
Los pedidos sin asignar deben listarse con motivo de exclusión
La interfaz debe permitir navegar entre rutas para ver detalles
El mapa debe mostrar todas las rutas con colores diferenciados
Las métricas agregadas deben mostrar resumen de todas las rutas
La API debe retornar estructura de datos con todas las métricas de resultado
Historia de Usuario 8.3: Cancelación y Re-ejecución de Optimización
Estado: Pendiente

Como planificador

Quiero cancelar una optimización en curso o re-ejecutar con parámetros ajustados

Para iterar hasta obtener una solución satisfactoria

Descripción Detallada:

El sistema debe permitir al planificador cancelar una optimización en curso si los resultados preliminares no son prometedores o si se necesita ajustar la configuración. La cancelación debe liberar los recursos del servidor inmediatamente.

Después de revisar los resultados, el planificador puede decidir ajustar parámetros específicos y re-ejecutar la optimización. El sistema debe permitir múltiples ejecuciones sucesivas, comparando los resultados para identificar la mejor solución.

Los resultados parciales de una optimización cancelada deben preservarse para permitir al planificador evaluar si la dirección de búsqueda era prometedora. Sin embargo, los resultados de optimizaciones canceladas no deben confirmarse directamente sin una nueva ejecución completa.

Criterios de Aceptación:

El usuario debe poder cancelar optimización en curso con botón de cancelación
La cancelación debe detener el procesamiento y liberar recursos
Los resultados parciales deben preservarse para revisión
La re-ejecutación debe poder usar la misma configuración con modificaciones
El historial de optimizaciones debe guardarse para comparación
La interfaz debe mostrar claramente qué optimizaciones están completadas y cuáles canceladas
La comparación de resultados debe permitir side-by-side de métricas
Módulo 9: Asignación de Conductores
Historia de Usuario 9.1: Asignación Automática de Conductores
Estado: Pendiente

Como planificador

Quiero que el sistema asigne automáticamente conductores a rutas generadas

Para acelerar el proceso de planificación considerando habilidades y disponibilidad

Descripción Detallada:

Después de que el plan es confirmado, el sistema puede asignar automáticamente conductores específicos a cada ruta basándose en criterios de compatibilidad y disponibilidad. La asignación automática considera las skills requeridas por cada ruta, la disponibilidad de conductores, sus habilidades individuales, y restricciones como horas de trabajo máximo y períodos de descanso requeridos.

El algoritmo de asignación automática debe verificar que cada conductor tenga las habilidades requeridas por todos los stops de su ruta asignada, que el conductor no tenga otras rutas asignadas que se solapen en tiempo, que el conductor tenga licencias válidas para el tipo de vehículo asignado, y que el conductor no supere las horas máximas de trabajo permitidas.

El sistema presenta sugerencias de asignación basadas en estos factores, pero el usuario puede modificar cualquier asignación manualmente. Las sugerencias deben incluir indicadores de calidad que muestren qué tan bien encaja cada conductor con los requisitos de la ruta.

Criterios de Aceptación:

La asignación automática debe verificar habilidades, disponibilidad y licencias
El sistema debe mostrar sugerencias con indicadores de calidad de asignación
Las restricciones de horas de trabajo deben respetarse en asignaciones automáticas
El usuario debe poder sobrescribir asignaciones automáticas manualmente
Las modificaciones manuales deben validarse en tiempo real
La API debe permitir ejecutar asignación automática o recibir asignaciones manuales
El historial de asignaciones debe registrarse para auditoría
Historia de Usuario 9.2: Asignación Manual de Conductores
Estado: Pendiente

Como planificador

Quiero asignar manualmente conductores específicos a rutas

Para manejar situaciones especiales que la asignación automática no contempla

Descripción Detallada:

La asignación manual permite al usuario seleccionar un conductor de la lista de disponibles para cada ruta. El sistema valida en tiempo real que el conductor seleccionado tiene las habilidades requeridas y no viola restricciones operativas. Si hay conflictos o advertencias, el sistema los presenta claramente pero no bloquea la asignación manual, permitiendo decisiones de excepciones cuando sea necesario.

La interfaz de asignación manual debe mostrar una lista de conductores disponibles con sus características clave, indicando claramente cualquier restricción o advertencia. El planificador puede entonces tomar una decisión informada sobre si proceder con la asignación o buscar una alternativa.

Las asignaciones manuales deben registrarse en el log de auditoría con información sobre qué conductor fue asignado, qué ruta, cuándo y quién realizó la asignación. Este registro es fundamental para trazabilidad y análisis posterior.

Criterios de Aceptación:

La lista de conductores debe mostrar disponibilidad, habilidades y restricciones
La validación de asignación debe ocurrir en tiempo real mientras se selecciona
Las advertencias deben mostrarse claramente sin bloquear la asignación
Las asignaciones manuales deben registrarse en auditoría
La interfaz debe permitir quitar asignaciones existentes para reasignar
Las asignaciones deben poder hacerse a rutas sin conductor o cambiar conductor asignado
La API debe validar restricciones antes de confirmar asignación manual
Historia de Usuario 9.3: Confirmación Final del Plan
Estado: Pendiente

Como planificador

Quiero confirmar el plan final después de asignar todos los conductores

Para bloquear el plan y hacerlo disponible para ejecución

Descripción Detallada:

La confirmación final del plan requiere que todos los conductores estén asignados y que no haya conflictos pendientes. El sistema verifica la completitud del plan y solicita confirmación explícita del usuario antes de marcar el plan como listo para ejecución.

La verificación de completitud incluye que todas las rutas tienen conductor asignado, que no hay conflictos de habilidades sin resolver, que todas las ventanas de tiempo se cumplen según el modo configurado, y que no hay violaciones de capacidad en ninguna ruta.

Una vez confirmado, el plan cambia su estado a CONFIRMED y se hace disponible para el módulo de monitoreo. Los cambios posteriores al plan confirmado requieren un proceso de reasignación que mantiene trazabilidad de las modificaciones.

Este punto de confirmación es irreversible en el contexto del MVP, estableciendo el baseline contra el cual se medirá el cumplimiento durante la ejecución.

Criterios de Aceptación:

El sistema debe verificar completitud antes de permitir confirmación
La verificación debe incluir conductor asignado, habilidades y cumplimiento de restricciones
Los conflictos pendientes deben mostrarse claramente con opción de resolver
La confirmación debe solicitar confirmación explícita con dialogo de seguridad
Después de confirmar, el plan cambia a estado CONFIRMED
Las modificaciones posteriores deben hacerse mediante proceso de reasignación
La API debe retornar error si se intenta confirmar plan incompleto
Módulo 10: Monitoreo de Ejecución
Historia de Usuario 10.1: Dashboard de Monitoreo en Tiempo Real
Estado: Pendiente

Como agente monitor

Quiero ver un dashboard con el estado de todas las rutas activas

Para mantener visibilidad del progreso de entregas y detectar problemas

Descripción Detallada:

El módulo de monitoreo proporciona una vista en tiempo real del estado de todas las rutas confirmadas. Los agentes monitores pueden ver cada conductor, su ruta asignada, los stops pendientes y completados, y la posición estimada si hay tracking activo.

El dashboard presenta indicadores clave de rendimiento incluyendo porcentaje de stops completados, retrasos acumulados, conductores fuera de ruta, y alertas de SLA. La información debe actualizarse automáticamente sin requerir refresco manual del navegador.

La interfaz debe mostrar un mapa central con todos los vehículos activos y su ubicación aproximada, una lista lateral con los conductores y su estado actual, y paneles de detalle que se expanden al seleccionar un elemento. El diseño debe priorizar la detección rápida de problemas.

Criterios de Aceptación:

El dashboard debe mostrar mapa con ubicaciones de vehículos y rutas
La lista de conductores debe mostrar estado, progreso y alertas activas
Las actualizaciones deben automáticas sin requerir refresco manual
Los indicadores clave deben incluir completitud, retrasos y alertas
La selección de conductor debe mostrar detalle de su ruta con stops
El rendimiento debe ser fluido con docenas de conductores activos
La API debe soportar polling frecuente con datos resumidos
Historia de Usuario 10.2: Sistema de Alertas
Estado: Pendiente

Como agente monitor

Quiero recibir alertas automáticas cuando se detectan desviaciones del plan

Para tomar acciones correctivas tempranamente

Descripción Detallada:

El sistema debe generar alertas automáticas basadas en reglas configurables. Las alertas críticas como conductores que no inician su ruta en la hora programada deben presentarse inmediatamente con opciones de acción rápida. Las alertas informativas pueden acumularse en un panel de notificaciones que el usuario puede revisar a conveniencia.

Las reglas de alerta configurables incluyen conductor sin iniciar ruta después de tiempo de tolerancia, stop completado con retraso excesivo respecto a hora prometida, conductor fuera de ruta planificada por distancia o tiempo, y conductor sin reportar progreso durante período extendido.

Cada alerta debe incluir contexto suficiente para que el usuario pueda tomar una decisión informada. El contexto incluye el conductor afectado, la ruta, el stop o situación que causó la alerta, la severidad de la desviación, y las acciones recomendadas o disponibles.

Criterios de Aceptación:

El sistema debe tener reglas de alerta preconfiguradas y editables
Las alertas críticas deben mostrarse inmediatamente con opciones de acción
Las alertas deben categorizarse por severidad: crítica, advertencia, informativa
Cada alerta debe incluir contexto completo del problema
El panel de notificaciones debe acumular alertas para revisión posterior
Las alertas deben poder marcarse como leídas o descartarse
La API debe permitir consultar alertas activas con filtros
Historia de Usuario 10.3: Actualización de Estado de Stops
Estado: Pendiente

Como agente monitor

Quiero actualizar el estado de stops durante la ejecución

Para mantener el registro de progreso de entregas

Descripción Detallada:

El sistema actualiza automáticamente los estados de stops cuando los conductores reportan completitud. En el MVP, esta actualización se realiza manualmente por el agente monitor, quien recibe confirmación de los conductores mediante llamadas telefónicas, mensajes u otros medios de comunicación.

Cada stop puede tener estados como pendiente para indica que aún no se ha visitado, en progreso para indica que el conductor está en proceso de entrega, completado para indica entrega exitosa, fallido para indica que la entrega no pudo completarse por algún motivo, y omitido para indica que el stop fue saltado intencionalmente.

La actualización de estado debe registrar el timestamp de la actualización, el usuario que realizó la modificación, notas opcionales sobre el estado, y en caso de completación o fallo, la hora real de llegada.

Criterios de Aceptación:

Los estados de stop deben incluir: PENDING, IN_PROGRESS, COMPLETED, FAILED, SKIPPED
La actualización debe requerir confirmación del usuario
El timestamp de actualización debe registrarse automáticamente
Las notas opcionales deben permitirse en cualquier cambio de estado
El sistema debe recalcular métricas de ruta al cambiar estado de stop
El historial de cambios de estado debe mantenerse para auditoría
La API debe validar transiciones de estado válidas
Módulo 11: Reasignaciones
Historia de Usuario 11.1: Proceso de Reasignación por Ausencia de Conductor
Estado: Pendiente

Como agente monitor

Quiero redistribuir los stops de un conductor ausente entre otros conductores

Para minimizar el impacto de ausencias en el cumplimiento de entregas

Descripción Detallada:

La capacidad de reasignación durante ejecución es crítica para la operación. Cuando un conductor no se presenta, el agente monitor puede iniciar un proceso de reasignación que redistribuye sus stops entre conductores disponibles.

El proceso de reasignación comienza con la selección del conductor afectado y la identificación de sus stops pendientes. El sistema calcula el impacto de diferentes escenarios de redistribución, considerando el aumento de distancia, el aumento de tiempo, y el impacto en ventanas de tiempo prometidas.

El sistema presenta opciones al usuario, quien selecciona y ejecuta la opción más apropiada. La opción puede incluir redistribución entre conductores existentes, asignación a conductores de reserva, o creación de rutas adicionales con vehículos de reemplazo.

Todas las reasignaciones se registran en el log de auditoría con el detalle completo de cambios realizados, incluyendo qué stops se movieron, de qué conductor a qué conductor, y el impacto estimado en métricas.

Criterios de Aceptación:

La selección de conductor ausente debe iniciar proceso de reasignación
El sistema debe calcular impacto de diferentes escenarios de redistribución
Las opciones de reasignación deben mostrar métricas de impacto claramente
El usuario debe poder seleccionar y ejecutar una opción
Las reasignaciones deben mantener compatibilidad de habilidades
El sistema debe verificar capacidad disponible de vehículos receptors
Todas las reasignaciones deben registrarse en auditoría
Historia de Usuario 11.2: Cálculo de Impacto de Reasignación
Estado: Pendiente

Como agente monitor

Quiero ver el impacto estimado de diferentes opciones de reasignación

Para tomar decisiones informadas sobre cómo redistribuir stops

Descripción Detallada:

El impacto de reasignación debe calcularse antes de ejecutar cualquier cambio. Las métricas de impacto incluyen número de conductores afectados, aumento total de distancia, aumento total de tiempo, y número de ventanas de tiempo potencialmente violadas.

El sistema debe presentar estos impactos de manera clara para que el usuario pueda tomar decisiones informadas sobre el trade-off entre，恢复 la operación y mantener la eficiencia del plan original. Los impactos deben expresarse en términos absolutos y porcentuales respecto al plan original.

Las reasignaciones deben seguir políticas predefinidas que garanticen consistencia y equidad. Cuando un conductor no se presenta, el sistema debe primero intentar redistribuir sus stops entre conductores del mismo tipo de flota que tengan capacidad disponible.

Criterios de Aceptación:

El cálculo de impacto debe incluir distancia adicional, tiempo adicional y ventanas comprometidas
Las métricas deben mostrarse en términos absolutos y porcentuales
El sistema debe calcular impacto para cada opción de reasignación
La política de reasignación debe priorizar conductores del mismo tipo de flota
Las restricciones de capacidad deben verificarse para cada conductor receptor
El sistema debe indicar si hay conductores disponibles para absorber los stops
La API debe retornar estructura de impacto para cada opción calculada
Historia de Usuario 11.3: Ejecución y Registro de Reasignaciones
Estado: Pendiente

Como agente monitor

Quiero ejecutar reasignaciones y ver el resultado inmediatamente

Para implementar los cambios y actualizar la operación

Descripción Detallada:

Las reasignaciones confirmadas se aplican de manera atómica: todos los cambios se ejecutan en una sola transacción de base de datos. Si algo falla durante la aplicación, el sistema hace rollback completo para evitar estados inconsistentes donde algunos cambios se aplicaron y otros no.

Después de la ejecución, el sistema debe actualizar inmediatamente todas las vistas de monitoreo para reflejar los cambios. Los conductores afectados deben recibir notificación de los cambios en sus rutas, idealmente mediante integración con sistemas de comunicación en versiones futuras.

El registro de reasignación debe incluir el timestamp de ejecución, el usuario que autorizó la reasignación, los cambios específicos realizados, y el impacto real versus el impacto estimado que se había calculado.

Criterios de Aceptación:

La ejecución de reasignación debe ser atómica con rollback en caso de error
Las vistas de monitoreo deben actualizarse inmediatamente después de ejecutar
El sistema debe registrar todos los detalles de la reasignación ejecutada
Los archivos de output deben regenerarse automáticamente si es necesario
El historial de reasignaciones debe consultarse posteriormente
La API debe retornar confirmación de ejecución exitosa o error con detalle
Los conductores afectados deben poder ver sus rutas actualizadas
Módulo 12: Generación de Output
Historia de Usuario 12.1: Generación de Archivos de Output
Estado: Pendiente

Como planificador

Quiero generar el archivo de output con las rutas confirmadas para distribución a conductores

Para proporcionar a los conductores la información necesaria para ejecutar sus rutas

Descripción Detallada:

Al completar la planificación y confirmación, el sistema genera el archivo de output que contiene la información final de rutas para cada conductor. El archivo incluye para cada conductor su identificación, la lista de stops en orden con dirección, hora de llegada estimada, y cualquier instrucción especial.

El proceso de generación valida que todas las rutas tienen conductor asignado, que no hay conflictos de schedule, y que el plan cumple con todas las restricciones configuradas. Si se detectan problemas, el sistema los reporta y no permite la generación hasta que sean resueltos.

El formato del archivo está diseñado para ser consumido por los conductores manualmente, incluyendo formato legible, organización clara por conductor, e información suficiente para que un conductor pueda ejecutar su ruta sin información adicional.

Criterios de Aceptación:

El archivo debe incluir información por conductor: identificación, stops con dirección, hora estimada, notas
La generación debe validar completitud del plan antes de producir output
Los problemas de validación deben reportarse sin generar archivo
El archivo debe estar formateado para lectura humana
La descarga debe estar disponible inmediatamente después de generar
El sistema debe mantener historial de outputs generados
La API debe permitir generación y descarga de output
Historia de Usuario 12.2: Métricas de Resumen del Plan
Estado: Pendiente

Como planificador

Quiero ver métricas de resumen del plan generado

Para evaluar la calidad de la planificación y comparar con planes anteriores

Descripción Detallada:

El sistema debe generar métricas de resumen del plan que se almacenan con la sesión de planificación para permitir análisis comparativos entre diferentes planes y períodos de tiempo.

Las métricas incluyen número total de stops en el plan, número total de rutas generadas, distancia total estimada de todas las rutas, tiempo total estimado incluyendo conducción y servicio, utilización promedio de capacidad de vehículos, número de ventanas de tiempo comprometidas, y distribución de stops por zona geográfica.

Estas métricas permiten evaluar la eficiencia de la planificación, identificar tendencias en la operación, y comparar el rendimiento entre diferentes configuraciones de optimización o diferentes períodos de tiempo.

Criterios de Aceptación:

Las métricas deben generarse automáticamente al confirmar el plan
Las métricas deben almacenarse con la sesión de planificación
La interfaz debe mostrar métricas de resumen al visualizar el plan
Las métricas históricas deben permitir comparación entre sesiones
La API debe retornar métricas como parte de la respuesta de planificación
El dashboard debe incluir gráficos de tendencias de métricas
Las métricas deben incluirse en reportes exportables
Módulo 13: APIs y Comunicación
Historia de Usuario 13.1: API RESTful de Gestión
Estado: Pendiente

Como desarrollador

Quiero consumir APIs RESTful documentadas para todas las operaciones del sistema

Para integrar el frontend con el backend y permitir extensiones futuras

Descripción Detallada:

El sistema debe exponer APIs RESTful para todas las operaciones de gestión de flotas, vehículos, conductores y otros recursos. Los endpoints deben seguir convenciones REST estándar con patrones consistentes para operaciones CRUD.

Los endpoints de consulta deben soportar parámetros de filtrado, paginación y ordenamiento. El filtrado utiliza una sintaxis de query params donde cada campo puede especificarse con operadores como equals, contains, greater than, y between. La paginación usa limit y offset con metadata de total count en la respuesta.

Las operaciones de actualización deben seguir el patrón de PATCH, aplicando solo los campos incluidos en el payload. Los errores de validación deben devolverse con código 400 y un cuerpo estructurado que indica cada campo inválido y su error específico.

Criterios de Aceptación:

La API debe seguir convenciones REST para operaciones CRUD
Los endpoints deben usar métodos HTTP apropiados: GET, POST, PUT, PATCH, DELETE
La paginación debe soportar limit y offset con total count
El filtrado debe usar operadores estándar en query params
Los errores deben retornar código HTTP apropiado con detalle de validación
La documentación de API debe estar disponible en formato OpenAPI
La autenticación debe usar tokens JWT en headers Authorization
Historia de Usuario 13.2: API de Planificación y Optimización
Estado: Pendiente

Como desarrollador

Quiero consumir APIs específicas para el flujo de planificación y optimización

Para implementar el frontend del módulo de planificación

Descripción Detallada:

La API de planificación gestiona el ciclo de vida completo de las sesiones de planificación. El endpoint de inicio de sesión recibe el archivo Excel como multipart upload y procesa el archivo de manera asíncrona, devolviendo un identificador de job.

La ejecución de optimización se maneja como un endpoint separado que recibe los parámetros de configuración y devuelve inmediatamente un identificador de job. El cliente debe hacer polling del endpoint de estado hasta que el job complete.

La confirmación del plan es un endpoint crítico que solo permite la transición al estado confirmado si todas las precondiciones se cumplen.

Criterios de Aceptación:

La carga de archivos debe usar multipart/form-data
El procesamiento debe ser asíncrono con job ID para tracking
La optimización debe recibir configuración completa y retornar job ID
El polling de job debe retornar estado y resultado cuando complete
La confirmación debe validar precondiciones y retornar errores específicos
Los endpoints deben requerir autenticación y autorización apropiadas
La API debe definir estructuras de request y response tipadas
Historia de Usuario 13.3: API de Monitoreo en Tiempo Real
Estado: Pendiente

Como desarrollador

Quiero consumir APIs para obtener estado de monitoreo y ejecutar acciones

Para implementar el frontend del módulo de monitoreo

Descripción Detallada:

La API de monitoreo proporciona endpoints para consultar el estado actual de todas las rutas y conductores activos. El endpoint principal devuelve una lista resumida con el estado de cada ruta, incluyendo métricas clave como stops completados, porcentaje de progreso, y alertas activas.

El endpoint de detalle de ruta proporciona información completa de una ruta específica, incluyendo la lista de stops con sus estados, tiempos estimados, y cualquier instrucción especial.

Los endpoints de acción de monitoreo permiten ejecutar operaciones como actualizar estado de stop, iniciar o finalizar ruta, y ejecutar reasignaciones. Cada endpoint debe validar los permisos del usuario y aplicar las reglas de negocio correspondientes.

Criterios de Aceptación:

El endpoint de estado resumido debe optimizarse para polling frecuente
El endpoint de detalle debe retornar información completa de la ruta
Las acciones deben validar permisos y reglas de negocio antes de ejecutar
Las reasignaciones deben recibir descripción del cambio y retornar impacto
Los endpoints deben soportar filtrado por fecha, flota, estado
La API debe incluir rate limiting para endpoints de monitoreo
Las respuestas deben incluir timestamps para sincronización
Módulo 14: Seguridad y Control de Acceso
Historia de Usuario 14.1: Sistema de Autenticación con JWT
Estado: Pendiente

Como usuario del sistema

Quiero iniciar sesión con mis credenciales y recibir un token de acceso

Para acceder a las funcionalidades del sistema de manera segura

Descripción Detallada:

La autenticación usa tokens JWT firmados con expiración configurable. El proceso de login verifica credenciales contra la base de datos y retorna un token de acceso junto con un token de refresco. Los tokens de acceso tienen vida corta mientras que los de refresco duran más y se usan para obtener nuevos tokens de acceso sin requerir credenciales nuevamente.

La seguridad de tokens incluye validación de issuer, audience, y tiempo de expiración. Los tokens robados o manipulados son rechazados con errores descriptivos. El sistema implementa rate limiting en endpoints de autenticación para prevenir ataques de fuerza bruta contra credenciales.

Las sesiones se rastrean en Redis para permitir revocación inmediata cuando sea necesario. Cada token de acceso incluye un identificador de sesión que puede invalidarse independientemente.

Criterios de Aceptación:

El login debe verificar credenciales contra base de datos
La respuesta debe incluir access token y refresh token
Los access tokens deben tener expiración corta (minutos)
Los refresh tokens deben tener expiración larga (días)
La API debe validar tokens en cada request protegido
Los tokens inválidos deben retornar error descriptivo
El rate limiting debe aplicarse a endpoints de autenticación
Historia de Usuario 14.2: Control de Acceso Basado en Roles
Estado: Pendiente

Como administrador

Quiero definir roles y permisos para diferentes tipos de usuarios

Para controlar qué operaciones puede realizar cada usuario

Descripción Detallada:

El sistema implementa un modelo de control de acceso basado en roles con roles predefinidos para planificador, monitor, administrador de flota, y administrador del sistema. Cada rol tiene un conjunto de permisos que determinan qué operaciones puede realizar el usuario.

Los permisos de acceso a datos incluyen restricciones por Company y Fleet. Un usuario de una Company específica solo puede ver y modificar datos de su Company, incluyendo las flotas terceras con las que tiene relación. Los administradores de flota tienen acceso completo a los recursos de sus flotas asignadas pero no a flotas de otras Companies.

Las acciones sensibles como eliminación de registros, modificación de configuraciones críticas, y ejecución de reasignaciones requieren confirmación explícita o elevación de permisos.

Criterios de Aceptación:

Los roles predefinidos deben incluir: PLANIFICADOR, MONITOR, ADMIN_FLOTA, ADMIN_SISTEMA
Cada rol debe tener permisos específicos definidos
Los permisos deben ser granulares a nivel de entidad y acción
El acceso a datos debe filtrarse por Company del usuario
Las acciones sensibles deben requerir confirmación adicional
El sistema debe registrar quién ejecutó cada acción sensible
La API debe verificar permisos antes de ejecutar operaciones
Módulo 15: Gestión de Sesiones
Historia de Usuario 15.1: Gestión de Sesiones con Redis
Estado: Pendiente

Como usuario del sistema

Quiero que mis sesiones se mantengan activas mientras estoy usando el sistema

Para no perder trabajo por expiración prematura de sesión

Descripción Detallada:

Las sesiones de usuario se almacenan en Redis para permitir escalabilidad horizontal y gestión centralizada. Cada sesión tiene un TTL configurado que define su duración total, y se renueva automáticamente con cada actividad del usuario.

El sistema debe manejar apropiadamente la expiración de sesiones, redirigiendo a login cuando sea necesario. Las operaciones sensibles deben verificar la validez de la sesión antes de ejecutar.

La revocación de sesiones debe ser posible a nivel de usuario individual o global, permitiendo a administradores invalidar sesiones cuando se sospeche compromiso de credenciales.

Criterios de Aceptación:

Las sesiones deben almacenarse en Redis con TTL configurado
La actividad del usuario debe renovar el TTL de la sesión
Las sesiones expiradas deben invalidarse automáticamente
La API debe verificar validez de sesión en cada request
Los administradores deben poder invalidar sesiones de usuarios
La invalidación global debe poder aplicarse a todos los usuarios
Los tokens de refresco deben invalidarse cuando la sesión se revoca
Módulo 16: Interfaz de Usuario
Historia de Usuario 16.1: Componentes UI Base
Estado: Pendiente

Como usuario del sistema

Quiero una interfaz consistente y accesible construída con componentes estándar

Para tener una experiencia de usuario coherente en todo el sistema

Descripción Detallada:

La interfaz de usuario se construye sobre Shadcn/ui proporcionando componentes base accesibles y consistentes. Los componentes de formulario incluyen inputs con validación en tiempo real, selects con búsqueda, date pickers con time selection, y file uploads con drag-and-drop. Cada componente tiene estados de error y success claramente diferenciados con mensajes descriptivos.

Los componentes de visualización de datos incluyen tablas con paginación, filtrado y ordenamiento; gráficos de métricas con tooltips informativos; y timelines para visualización de secuencias de eventos.

El componente de mapa utiliza MapLibre GL JS para mostrar rutas, ubicaciones de stops, y posiciones de vehículos en tiempo real. Las capas de mapa pueden alternarse para mostrar diferentes información.

Criterios de Aceptación:

Los componentes deben seguir el diseño de Shadcn/ui
Los formularios deben tener validación en tiempo real
Las tablas deben soportar paginación, filtrado y ordenamiento
Los date pickers deben permitir selección de fecha y hora
Los file uploads deben soportar drag-and-drop
Los componentes deben ser accesibles según WCAG 2.1
La interfaz debe ser consistente en toda la aplicación
Historia de Usuario 16.2: Diseño Responsivo
Estado: Pendiente

Como usuario del sistema

Quiero que la interfaz funcione correctamente en diferentes tamaños de pantalla

Para usar el sistema desde escritorio, tablet o móvil

Descripción Detallada:

El diseño utiliza Tailwind CSS con breakpoints estándar para responsividad. El layout principal incluye sidebar colapsable en móviles, header con acciones contextuales, y área de contenido principal con scroll independiente.

Los componentes de tabla muestran solo las columnas más importantes en móviles, con opción de expandir para ver detalles. Los formularios muestran labels above inputs en desktop pero pueden usar floating labels en móviles para ahorrar espacio.

Los mapas mantienen funcionalidad completa pero ajustan el nivel de zoom inicial según el viewport disponible.

Criterios de Aceptación:

El diseño debe adaptarse a breakpoints de Tailwind: sm, md, lg, xl, 2xl
El sidebar debe colapsarse en pantallas pequeñas
Las tablas deben mostrar columnas esenciales en móviles
Los formularios deben ser usables en pantallas pequeñas
Los mapas deben mantener funcionalidad completa en cualquier tamaño
Las interacciones táctiles deben tener áreas de toque adecuadas
La interfaz debe cargarse desde service worker para funcionamiento offline básico
Historia de Usuario 16.3: Flujo de Planificación
Estado: Pendiente

Como planificador

Quiero un flujo guiado para completar el proceso de planificación

Para realizar mi trabajo de manera eficiente sin perder pasos

Descripción Detallada:

El flujo de planificación comienza en un dashboard que muestra las sesiones recientes con su estado. Desde ahí el usuario puede crear una nueva sesión o continuar con una existente. La carga de archivo guía al usuario a través del proceso con indicadores de progreso y feedback sobre errores encontrados.

La revisión de items permite inline editing con shortcuts de teclado para eficiencia. La configuración de optimización presenta todas las opciones de manera organizada. La ejecución de optimización muestra progreso y permite cancelación. La revisión de resultados permite ajustes si es necesario. La confirmación final requiere validación explícita.

Criterios de Aceptación:

El dashboard debe mostrar sesiones recientes con estado
La creación de nueva sesión debe iniciar wizard de planificación
El wizard debe mostrar progreso actual y pasos restantes
Los errores deben mostrarse claramente con opciones de corrección
La revisión de items debe permitir edición inline
Los atajos de teclado deben acelerar operaciones frecuentes
La confirmación debe requerir validación explícita de usuario
Historia de Usuario 16.4: Flujo de Monitoreo
Estado: Pendiente

Como agente monitor

Quiero un flujo eficiente para dar seguimiento a la ejecución de rutas

Para mantener visibilidad y responder a problemas rápidamente

Descripción Detallada:

El flujo de monitoreo muestra un mapa central con resumen de todas las rutas activas. Un panel lateral muestra la lista de conductores con su estado y progreso. Al seleccionar un conductor, el panel muestra el detalle de su ruta con la lista de stops y sus estados.

Las acciones de reasignación se inician desde este panel con wizard que guía a través del proceso. Las alertas se presentan en un panel dedicado que puede expandirse para ver detalles.

Criterios de Aceptación:

El mapa central debe mostrar todas las rutas y vehículos activos
El panel lateral debe listar conductores con estado y progreso
La selección de conductor debe mostrar detalle de ruta
Las alertas deben aparecer prominentemente cuando ocurren
El wizard de reasignación debe guiar paso a paso
La actualización de estado debe ser inmediata
Las métricas de rendimiento deben estar visibles
Módulo 17: Rendimiento y Escalabilidad
Historia de Usuario 17.1: Optimización de Consultas Geoespaciales
Estado: Pendiente

Como arquitecto del sistema

Quiero que las consultas geoespaciales utilicen índices apropiados

Para garantizar tiempos de respuesta aceptables con grandes volúmenes de datos

Descripción Detallada:

El uso de PostGIS para almacenamiento geoespacial requiere atención especial al diseño de índices y la estructura de consultas. Todos los campos de geometría deben tener índices GIST creados y mantenidos actualizados.

Las consultas de proximidad deben usar los operadores espaciales nativos de PostGIS en lugar de cálculos manuales en aplicación, aprovechando las optimizaciones del motor de base de datos.

Las consultas de enrutamiento que involucran muchas paradas deben optimizarse mediante pre-cálculo de matrices de distancia cuando los sets de direcciones son reutilizables.

Criterios de Aceptación:

Todos los campos de geometría deben tener índice GIST
Las consultas de proximidad deben usar operadores PostGIS nativos
Las matrices de distancia deben cachearse cuando sea posible
Las operaciones batch deben usar inserciones optimizadas
El rendimiento debe medirse con conjuntos de datos grandes
Los planes de ejecución deben analizarse para identificar cuellos de botella
Las estadísticas de tabla deben mantenerse actualizadas
Historia de Usuario 17.2: Caché de Datos con Redis
Estado: Pendiente

Como arquitecto del sistema

Quiero implementar estrategias de caché efectivas con Redis

Para mejorar el rendimiento de lecturas frecuentes

Descripción Detallada:

Redis se utiliza como capa de caché para mejorar el rendimiento de lecturas frecuentes. Las estrategias de caché incluyen cache-aside para datos de configuración, write-through para métricas agregadas, y time-to-live configurado para cada tipo de dato.

Los datos de sesión de usuario y tokens de autenticación se almacenan en Redis con TTL que coincide con la duración de la sesión.

Los resultados de geocodificación de direcciones se cachean extensivamente dado que la misma dirección puede aparecer múltiples veces en diferentes planificaciones.

Criterios de Aceptación:

Redis debe configurarse con estrategia de conexión apropiada
Las claves de caché deben incluir versionado para invalidación granular
El TTL debe configurarse apropiadamente para cada tipo de dato
Las sesiones deben almacenarse en Redis con TTL configurable
La geocodificación debe cachearse con TTL largo
El sistema debe manejar apropiadamente fallos de Redis
Las métricas de caché deben monitorizarse para optimización
Historia de Usuario 17.3: Procesamiento Batch Eficiente
Estado: Pendiente

Como arquitecto del sistema

Quiero que el procesamiento de archivos grandes sea eficiente

Para manejar importación de miles de registros sin bloquear el sistema

Descripción Detallada:

Las operaciones de batch como carga de archivos CSV con miles de registros deben procesarse de manera eficiente, evitando el problema N+1 de consultas individuales.

El sistema debe usar inserciones batch con tamaño optimizado para el driver de base de datos, y debe procesar la geocodificación de manera paralela cuando sea posible sin exceder límites de APIs externas.

El parsing de archivos debe poder procesar streaming para archivos muy grandes sin cargar todo en memoria.

Criterios de Aceptación:

Las inserciones deben usar operaciones batch en lugar de individuales
El tamaño de batch debe optimizarse para el driver de base de datos
El parsing debe soportar streaming para archivos grandes
El progreso debe reportarse durante procesamiento largo
Los errores deben capturarse a nivel de registro sin bloquear todo el proceso
La memoria debe gestionarse apropiadamente durante procesamiento
Los timeouts deben configurarse para evitar bloqueos indefinidos
Anexo A: Formato de Archivo de Importación
El archivo CSV de importación debe seguir la siguiente especificación:

Campo	Descripción	Formato	Requerido
track	Identificador único del pedido	Texto, máximo 50 caracteres	Sí
direccion	Dirección textual de entrega	Texto libre	Sí
departamento	División administrativa nivel 1	Texto	Sí
provincia	División administrativa nivel 2	Texto	Sí
distrito	División administrativa nivel 3	Texto	Sí
latitud	Coordenada geográfica latitud	Decimal, rango -90 a 90	Sí
longitud	Coordenada geográfica longitud	Decimal, rango -180 a 180	Sí
hora_prometida	Ventana de tiempo prometida	HH:MM-HH:MM o HH:MM	No
peso_kg	Peso del pedido en kg	Numérico decimal	No
volumen_l	Volumen del pedido en litros	Numérico decimal	No
skills_requeridas	Habilidades necesarias	Lista separada por comas	No
La codificación del archivo debe ser UTF-8, y el delimitador puede ser coma o punto y coma.

Anexo B: Formato de Archivo de Output
El archivo de output generado al confirmar el plan contiene:

Hoja de Resumen:

Total de conductores
Total de stops
Distancia total estimada
Tiempo total estimado
Hojas por Conductor:

Conductor: nombre e identificador
Vehículo: matrícula y tipo
Orden: número secuencial de stop
Dirección: completa
Hora Llegada: estimada
Hora Salida: estimada
Skills Requeridas: para referencia
Notas: instrucciones especiales
Contacto: teléfono del cliente cuando aplica
Resumen de Estados de Historias de Usuario
Módulo	Historia	Estado
Gestión de Companies	1.1 Creación de Companies	Pendiente
Gestión de Companies	1.2 Aislamiento de Datos	Pendiente
Gestión de Flotas	2.1 Creación de Flotas	Pendiente
Gestión de Flotas	2.2 Asociación de Vehículos	Pendiente
Gestión de Flotas	2.3 Asociación de Conductores	Pendiente
Gestión de Vehículos	3.1 Registro de Vehículos	Pendiente
Gestión de Vehículos	3.2 Estado Operativo	Pendiente
Gestión de Vehículos	3.3 Catálogo de Habilidades	Pendiente
Gestión de Conductores	4.1 Registro de Conductores	Pendiente
Gestión de Conductores	4.2 Habilidades de Conductores	Pendiente
Gestión de Conductores	4.3 Estado Operativo	Pendiente
Ventanas de Tiempo	5.1 Presets de Ventanas	Pendiente
Ventanas de Tiempo	5.2 Estrictez de Ventanas	Pendiente
Importación	6.1 Carga de CSV	Pendiente
Importación	6.2 Validación	Pendiente
Importación	6.3 Mapeo de Columnas	Pendiente
Importación	6.4 Geocodificación	Pendiente
Optimización	7.1 Configuración de Depot	Pendiente
Optimización	7.2 Capacidades	Pendiente
Optimización	7.3 Tiempo y Ventanas	Pendiente
Optimización	7.4 Estrategia	Pendiente
Optimización	8.1 Ejecución Asíncrona	Pendiente
Optimización	8.2 Visualización de Resultados	Pendiente
Optimización	8.3 Cancelación y Re-ejecución	Pendiente
Asignación	9.1 Asignación Automática	Pendiente
Asignación	9.2 Asignación Manual	Pendiente
Asignación	9.3 Confirmación Final	Pendiente
Monitoreo	10.1 Dashboard	Pendiente
Monitoreo	10.2 Sistema de Alertas	Pendiente
Monitoreo	10.3 Actualización de Stops	Pendiente
Reasignaciones	11.1 Reasignación por Ausencia	Pendiente
Reasignaciones	11.2 Cálculo de Impacto	Pendiente
Reasignaciones	11.3 Ejecución y Registro	Pendiente
Output	12.1 Generación de Output	Pendiente
Output	12.2 Métricas de Resumen	Pendiente
APIs	13.1 API RESTful	Pendiente
APIs	13.2 API de Planificación	Pendiente
APIs	13.3 API de Monitoreo	Pendiente
Seguridad	14.1 Autenticación JWT	Pendiente
Seguridad	14.2 Control de Acceso	Pendiente
Sesiones	15.1 Gestión de Sesiones	Pendiente
UI	16.1 Componentes Base	Pendiente
UI	16.2 Diseño Responsivo	Pendiente
UI	16.3 Flujo de Planificación	Pendiente
UI	16.4 Flujo de Monitoreo	Pendiente
Rendimiento	17.1 Consultas Geoespaciales	Pendiente
Rendimiento	17.2 Caché con Redis	Pendiente
Rendimiento	17.3 Procesamiento Batch	Pendiente
Este documento unificado proporciona la especificación completa del Sistema de Gestión Logística convertido en historias de usuario con descripciones detalladas, criterios de aceptación y estado de completitud. Cada historia representa una funcionalidad específica que puede asignarse a equipos de desarrollo, estimarse y rastrearse independientemente.