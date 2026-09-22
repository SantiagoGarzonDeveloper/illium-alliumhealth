# Backend propio de ILLIUM (sustituye a las Cloud Functions)

Estos dos archivos **NO van en public_html**: se suben por FTP a
`/alliumhealth.net/illium-privado/` (un nivel por encima de la web), donde
nadie los puede abrir desde internet.

- `illium-nucleo.php` — correo, comprobación de identidad y utilidades.
- `config.php` — correos de admin, token de WhatsApp y clave de Stripe.

La parte pública es `public/api.php`, que sí viaja con el build normal.

## Para activar WhatsApp o Stripe
Editar `config.php` y rellenar `meta_token` o `stripe_secreto`, y volver a
subirlo a `/alliumhealth.net/illium-privado/config.php`.

## Comprobar que todo está bien
    curl "https://alliumhealth.net/api.php?accion=estado"
