# Elite Slot Tracker

App de tracking de slots casino avec synchronisation cloud (Supabase).

## Déploiement Netlify

### Option 1 — Glisser-déposer (le plus simple)
1. Lance `npm install` puis `npm run build` en local
2. Va sur app.netlify.com, onglet "Sites"
3. Glisse le dossier `dist/` dans la zone "drag and drop"
4. C'est en ligne

### Option 2 — Netlify CLI
```bash
npm install
npm run build
npx netlify deploy --prod --dir=dist
```

### Option 3 — Depuis Git
1. Pousse ce dossier sur un repo GitHub
2. Sur Netlify : "Add new site" → "Import from Git"
3. Build command : `npm run build` | Publish directory : `dist`
4. Deploy

## Synchronisation
Au premier lancement, va dans **Synchronisation** (sidebar) → "Activer la sync".
Une clé est générée (format XXXX-XXXX-XXXX-XXXX). Note-la.
Sur un autre appareil : ouvre l'app → Synchronisation → "J'ai déjà une clé" → colle-la.

Le backend Supabase est déjà configuré (clé publique dans src/lib/supabase.js).

## Stack
- Vite + React 18
- Tailwind CSS
- Supabase (PostgreSQL + RPC sécurisées)
- lucide-react
