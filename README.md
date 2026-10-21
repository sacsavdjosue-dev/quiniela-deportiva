# Quiniela Deportiva — pruebas con Render y PostgreSQL

## Funciones
- 10 u 11 partidos, último partido comodín, selección lateral L/E/V.
- Dobles y triples con cálculo de todas las combinaciones (hasta 5000).
- Registro central de folio, participante, selecciones, combinaciones, importe y estado pendiente/recibida/pagada/validada.
- Edición administrativa de partidos y escudos; exportación CSV.
- WhatsApp recibe un mensaje prellenado tras guardar la apuesta. Abrir WhatsApp no confirma envío, recepción ni pago.

## Publicar
1. Sube el contenido de esta carpeta a la raíz de tu repositorio de GitHub. **No subas .env ni claves privadas.**
2. Crea un proyecto gratuito en Supabase y localiza la cadena de conexión PostgreSQL, preferiblemente el pooler de sesión compatible con tu servidor. La cadena debe mantenerse secreta.
3. En Render, crea un servicio Web desde ese repositorio (o importa `render.yaml`). Usa `npm install` y `npm start`.
4. Configura las variables `DATABASE_URL`, `ADMIN_PASSWORD` (clave fuerte >=12 caracteres), `SESSION_SECRET` (valor aleatorio >=32 caracteres) y `NODE_ENV=production`.
5. Abre la URL HTTPS de Render: carga `/api/health`, prueba el panel y registra una quiniela de prueba. Luego entra como administrador y verifica el folio.
6. Si la conexión TLS a Supabase falla, consulta sus instrucciones de CA/certificados; **no desactives la verificación TLS en producción.**

## Seguridad y límites
- La base de datos se inicializa automáticamente al arrancar. PostgreSQL persiste independientemente del reinicio del servidor.
- Protege la contraseña y el acceso de administrador; no publiques URLs de conexión, claves ni archivos .env.
- El panel no ofrece cancelación de una apuesta ya creada; cambiar el estado es manual.
- Las cuentas gratuitas pueden dormir o tener cuotas, y no garantizan alta disponibilidad.
- No se cobran pagos automáticamente. **Usar solo apuestas simuladas para pruebas** antes de validar requisitos regulatorios y de protección de datos.
