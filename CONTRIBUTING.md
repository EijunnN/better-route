# Contribuir a BetterRoute

Gracias por tu interes en contribuir a BetterRoute. Toda ayuda es bienvenida, desde reportar bugs hasta implementar nuevas funcionalidades.

## Como Contribuir

### Reportar Bugs

1. Verifica que el bug no haya sido reportado previamente en [Issues](https://github.com/tu-usuario/betterroute/issues)
2. Crea un nuevo issue con:
   - Titulo claro y descriptivo
   - Pasos para reproducir el problema
   - Comportamiento esperado vs actual
   - Screenshots si aplica
   - Version de BetterRoute, navegador y SO

### Sugerir Mejoras

Abre un issue con la etiqueta `enhancement` describiendo:
- El problema que resuelve
- La solucion propuesta
- Alternativas consideradas

### Enviar Codigo

1. **Fork** el repositorio
2. **Crea una rama** desde `master`:
   ```bash
   git checkout -b feature/mi-nueva-funcionalidad
   ```
3. **Instala dependencias**:
   ```bash
   bun install
   ```
4. **Haz tus cambios** siguiendo las convenciones del proyecto
5. **Verifica que el build pase**:
   ```bash
   bun run build
   ```
6. **Commit** con un mensaje descriptivo:
   ```bash
   git commit -m "feat: agregar soporte para X"
   ```
7. **Push** a tu fork:
   ```bash
   git push origin feature/mi-nueva-funcionalidad
   ```
8. Abre un **Pull Request** contra `master`

## Convenciones

### Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

| Prefijo | Uso |
|---------|-----|
| `feat:` | Nueva funcionalidad |
| `fix:` | Correccion de bug |
| `refactor:` | Refactorizacion sin cambio funcional |
| `docs:` | Cambios en documentacion |
| `style:` | Formato, espacios, punto y coma, etc. |
| `test:` | Agregar o corregir tests |
| `chore:` | Tareas de mantenimiento |

### Codigo

- **TypeScript** estricto — sin `any` innecesarios
- **Biome** para linting y formato (se ejecuta automaticamente)
- **Compound components** (patron Provider > State/Actions/Meta/Derived) para contextos de pagina
- **shadcn/ui** para componentes de interfaz
- Nombres de variables y funciones en **ingles**, UI y mensajes al usuario en **espanol**

### Estructura de Archivos

```
src/components/{feature}/
  ├── {feature}-context.tsx   # Provider con state/actions/meta/derived
  ├── {feature}-views.tsx     # Componentes de vista (List, Form)
  ├── {feature}-form.tsx      # Formulario (si es complejo)
  └── index.ts                # Barrel exports
```

### Pull Requests

- Titulo corto y descriptivo (max 70 caracteres)
- Descripcion con resumen de cambios y motivacion
- Un PR por funcionalidad o fix
- Asegurate de que el build pase antes de solicitar review

## Configuracion del Entorno de Desarrollo

### Requisitos

- **Bun** 1.0+ (o Node.js 20+)
- **PostgreSQL** 15+
- **Docker** (para VROOM/OSRM)

### Setup Rapido

```bash
# Clonar tu fork
git clone https://github.com/TU-USUARIO/betterroute.git
cd betterroute

# Instalar dependencias
bun install

# Copiar variables de entorno
cp .env.example .env
# Editar .env con tus valores locales

# Iniciar servicios de routing
docker compose --profile routing up -d

# Migraciones de base de datos
bun run db:migrate
bun run db:seed

# Iniciar en modo desarrollo
bun run dev
```

## Areas Donde Puedes Ayudar

Si no sabes por donde empezar, estos son buenos puntos de entrada:

- Issues etiquetados con `good first issue`
- Mejoras de documentacion
- Traduccion de mensajes de UI
- Tests unitarios y de integracion
- Mejoras de accesibilidad (a11y)
- Optimizacion de rendimiento

## Codigo de Conducta

Se espera que todos los contribuidores mantengan un ambiente respetuoso y colaborativo. Tratamos a todos con cortesia, independientemente de su nivel de experiencia.

## Licencia

Al contribuir a BetterRoute, aceptas que tus contribuciones seran licenciadas bajo la [Licencia MIT](LICENSE).

---

Gracias por hacer BetterRoute mejor para todos.
