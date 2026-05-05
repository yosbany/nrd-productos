# NRD Productos

Sistema de gestión de productos para el ecosistema NRD.

## Descripción

Aplicación web PWA para gestionar el catálogo de productos, incluyendo:
- Crear, editar y eliminar productos
- Búsqueda de productos por nombre, SKU o precio
- Importación masiva desde archivos CSV
- Gestión de estado activo/inactivo
- Visualización de detalles de productos

## Características

- **CRUD completo** de productos
- **Búsqueda en tiempo real** por nombre, SKU o precio
- **Importación CSV** con vista previa
- **PWA** - Instalable como aplicación móvil
- **Offline-first** con Service Worker
- **Autenticación** integrada con Firebase Auth
- **Tiempo real** con Firebase Realtime Database

## Stack Tecnológico

- JavaScript ES6 nativo (sin frameworks)
- Tailwind CSS (via CDN)
- Firebase Realtime Database
- NRD Data Access Library

## Estructura

```
nrd-productos/
├── index.html          # HTML principal
├── app.js              # Navegación principal
├── auth.js             # Autenticación
├── modal.js            # Modales y alertas
├── logger.js           # Sistema de logging
├── tabs/
│   └── products.js     # Gestión de productos
├── service-worker.js   # PWA
├── manifest.json       # PWA config
└── styles.css          # Estilos mínimos
```

## Uso

1. Abrir `index.html` en un navegador o servidor local
2. Iniciar sesión con credenciales de Firebase
3. Gestionar productos desde la interfaz

## Desarrollo Local

Usar el servidor local incluido en `tools/nrd-productos-server/server.sh`

## Licencia

Propietario - NRD System
