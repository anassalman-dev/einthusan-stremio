# 🇮🇳 Einthusan — Stremio Addon

Addon Stremio pour regarder des films indiens HD depuis [einthusan.tv](https://einthusan.tv) sur n'importe quel appareil.

## Fonctionnalités

- 🔥 **À la une** — Les 7 derniers films par langue
- 📈 **Populaires** — Grand catalogue filtrable (Aujourd'hui / Cette semaine / Ce mois)
- 🔍 **Recherche** — Par titre dans chaque langue
- 🌍 **8 langues** — Tamil, Hindi, Telugu, Malayalam, Kannada, Bengali, Marathi, Punjabi
- 📺 **Multi-appareils** — Android, Samsung TV, Mac, Web, iOS

## Installation

1. Va sur `https://TON-ADDON.vercel.app/configure`
2. Entre ton email et mot de passe Einthusan
3. Clique sur **"Installer dans Stremio"**

## Structure du projet

```
einthusan-stremio/
├── api/
│   └── [transport].js    ← Handler Vercel (entrée des requêtes)
├── src/
│   ├── addon.js           ← Manifest + handlers Stremio
│   └── einthusan.js       ← Client HTTP Einthusan (login, browse, stream)
├── configure/
│   └── index.html         ← Page de configuration utilisateur
├── server.js              ← Serveur local pour développement
├── vercel.json            ← Config Vercel
└── package.json
```

## Développement local

```bash
npm install
npm start
# → http://localhost:7001/configure
```

## Déploiement Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

## Comment ça marche

```
1. L'utilisateur entre email + password sur /configure
2. L'addon encode les credentials en base64
3. URL personnalisée: /BASE64(email:password)/manifest.json
4. Chaque requête → login automatique → cookie session
5. Cookie mis en cache 2h30 pour éviter de se reconnecter à chaque fois
```

## Notes techniques

- **Authentification** : Login via POST sur `/account/login/` → cookie `sid` + `_gorilla_csrf`
- **Stream** : URL m3u8 extraite depuis `/premium/movie/watch/{id}/`
- **Session** : Cache en mémoire, renouvellement auto après 2h30
- **Sécurité** : Les credentials sont encodés en base64 dans l'URL (V1 — amélioration prévue)
