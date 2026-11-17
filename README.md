# Juntix MVP

PWA para completar partidos de fútbol amateur. Incluye las 4 funciones del MVP: registro e inicio de sesión, crear partido, inscripción y lista de espera automática. Más: bajarse del partido, cancelar partido (organizador), perfil y eliminación de cuenta.

## Qué trae

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `app.js` | Interfaz (sin dependencias ni compilación) |
| `core.js` | Reglas de negocio, las usan el navegador y el servidor |
| `manifest.webmanifest`, `sw.js`, `icon*` | Instalación como app desde el navegador |
| `server/server.js` | API y servidor de archivos (solo Node 18 o superior, sin `npm install`) |
| `server/test-core.js` | 29 casos de prueba automáticos |

Sin servidor, la interfaz funciona en **modo demostración** (datos solo en el navegador). Con servidor, el aviso desaparece y los datos son compartidos.

## Probar en el computador

```bash
node server/server.js          # abre http://127.0.0.1:3000
node --test server/test-core.js
```

## Desplegar en el VPS (Ubuntu)

1. Instalar Node 20 o 22 y subir esta carpeta a `/opt/juntix`.
2. Servicio `systemd` en `/etc/systemd/system/juntix.service`:

```ini
[Unit]
Description=Juntix
After=network.target

[Service]
WorkingDirectory=/opt/juntix
Environment=PORT=3000 HOST=127.0.0.1 TRUST_PROXY=1 DATA_DIR=/var/lib/juntix
ExecStart=/usr/bin/node server/server.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/lib/juntix && sudo chown www-data /var/lib/juntix
sudo systemctl enable --now juntix
```

3. Nginx como proxy con HTTPS (reemplaza `juntix.tudominio.cl`):

```nginx
server {
  server_name juntix.tudominio.cl;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $host;
  }
}
```

```bash
sudo certbot --nginx -d juntix.tudominio.cl
```

4. Verificar: `curl https://juntix.tudominio.cl/api/health` debe responder `{"ok":true,"app":"juntix"}`. Esa dirección es el **enlace público del MVP** para el informe.

La app debe quedar en la raíz del dominio (no en una subcarpeta).

## Respaldo semanal (Joseth)

Todos los datos están en `/var/lib/juntix/juntix.json`. Un respaldo semanal con cron:

```bash
0 3 * * 0 cp /var/lib/juntix/juntix.json /var/backups/juntix-$(date +\%F).json
```

Para restaurar, detén el servicio, copia el respaldo sobre `juntix.json` y vuelve a iniciarlo.

## Qué corrige respecto del informe de pruebas

| Defecto | Corrección |
|---|---|
| D1. Doble clic supera el cupo | Inscribir es idempotente y el cupo se revisa en la misma operación que escribe; el botón se bloquea mientras la solicitud está en curso |
| D2. No se promueve a la lista de espera | Al bajarse alguien, entra automáticamente la primera persona en espera y recibe un aviso |
| D3. Orden de la lista | Se ordena por orden de llegada, también cuando alguien sale de la lista |

## Limitaciones conocidas del MVP

- No hay verificación de correo ni restablecimiento de contraseña (requieren enviar correos).
- No hay notificaciones push ni recordatorios: la persona ve su lugar y los avisos al abrir la aplicación.
- La base de datos es un archivo JSON, suficiente para el piloto de 30 usuarios. Para escalar se cambia por MySQL o PostgreSQL sin tocar `core.js`.
- Solo fútbol, como define el alcance del piloto.
