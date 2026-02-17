# Modulo de Configuracion

## Vision general

El modulo de Configuracion es donde se adapta BetterRoute a la operacion de cada empresa. Aqui se definen las reglas, capacidades, restricciones y campos que el sistema utiliza para planificar rutas, gestionar entregas y generar reportes.

Una configuracion correcta asegura que la planificacion de rutas sea precisa, que los conductores capturen la informacion necesaria en cada entrega, y que los datos se exporten correctamente.

## Sub-modulos

El modulo se compone de seis areas de configuracion. Cada una se puede ajustar de forma independiente:

### [Perfil de Empresa](./perfil-empresa.md)
Define las dimensiones de capacidad que maneja tu negocio (peso, volumen, valorizado, unidades) y la prioridad de cada tipo de pedido. Esta configuracion adapta los formularios, las plantillas CSV y el motor de optimizacion a tu operacion.

**Configura esto primero** -- es la base sobre la que funcionan los demas modulos.

---

### [Presets de Optimizacion](./presets-optimizacion.md)
Configuraciones predefinidas que determinan como el sistema genera las rutas: balanceo de visitas, distancia maxima, factor de trafico, modo de finalizacion de ruta, y mas. Permite guardar multiples presets y activar uno como predeterminado.

**Usa esto cuando** quieras estandarizar y repetir el mismo tipo de planificacion sin configurar parametros cada vez.

---

### [Ventanas de Tiempo](./ventanas-de-tiempo.md)
Presets reutilizables de horarios de entrega que se asignan a los pedidos. Soporta tres tipos de ventana (Turno, Rango, Exacto) y dos niveles de rigurosidad (Estricto y Flexible). El optimizador respeta estas restricciones al generar las rutas.

**Usa esto cuando** tus clientes tienen horarios de recepcion definidos y necesitas que las rutas los respeten.

---

### [Habilidades de Vehiculos y Conductores](./habilidades-vehiculos.md)
Sistema de compatibilidad entre vehiculos, conductores y pedidos. Define habilidades especiales (refrigerado, materiales peligrosos, fragil) y el sistema solo asigna pedidos a recursos que cumplen con los requisitos.

**Usa esto cuando** tu flota no es homogenea y ciertos pedidos solo pueden ser atendidos por vehiculos o conductores especificos.

---

### [Estados de Entrega](./estados-de-entrega.md)
Define las etapas por las que pasa cada entrega, con nombres, colores y requerimientos personalizados (foto, firma, notas, motivo de fallo). Opera sobre cinco estados base del sistema que cada empresa personaliza con su terminologia.

**Usa esto cuando** necesitas pruebas de entrega, motivos de fallo detallados, o un flujo de estados que refleje tu proceso real.

---

### [Campos Personalizados](./campos-personalizados.md)
Campos adicionales que cada empresa define para capturar informacion especifica: montos de cobro, referencias de cliente, tipos de servicio, y mas. Se configuran por entidad (pedidos o entregas) y se integran con la tabla de pedidos, la app del conductor y la importacion/exportacion CSV.

**Usa esto cuando** necesitas registrar informacion que no existe en los campos estandar del sistema.

---

## Orden recomendado de configuracion

Para una empresa nueva, el orden sugerido es:

1. **Perfil de Empresa** -- Activar las dimensiones relevantes para tu negocio
2. **Estados de Entrega** -- Definir el flujo de estados y requerimientos de tu operacion
3. **Habilidades** -- Si tu flota tiene capacidades diferenciadas
4. **Ventanas de Tiempo** -- Si tus clientes tienen horarios de recepcion
5. **Campos Personalizados** -- Agregar campos especificos de tu operacion
6. **Presets de Optimizacion** -- Ajustar parametros del motor de rutas

## Acceso

El modulo de Configuracion esta disponible desde el menu lateral para usuarios con rol de administrador. Cada sub-modulo tiene su propia pagina accesible desde el menu de Configuracion o directamente por URL.
