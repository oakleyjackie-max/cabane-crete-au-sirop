# Cabane Crête au Sirop - Site de Réservation

Site web de réservation pour le sirop d'érable de Cabane Crête au Sirop.

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

Le site sera disponible à `http://localhost:5173`

## Production

```bash
npm run build
```

Les fichiers de production seront générés dans le dossier `dist/`.

## Déploiement sur Netlify

**Repository GitHub :** https://github.com/oakleyjackie-max/cabane-crete-au-sirop
**Site en production :** https://cabanecrete.netlify.app
**Tableau de bord Netlify :** https://app.netlify.com/projects/cabanecrete

> ✅ **Déploiement automatique activé** - Le site se déploie automatiquement à chaque push vers la branche `main`

### Option 1: Déploiement via Netlify CLI

```bash
npm install -g netlify-cli    # Installer le CLI (une seule fois)
netlify login                  # Se connecter (ouvre le navigateur)
netlify link                   # Lier le projet au site cabanecrete
npm run build                  # Construire le site
netlify deploy --prod --dir=dist  # Déployer en production
```

### Option 2: Déploiement automatique via Git (RECOMMANDÉ)

**Le site est connecté au repository GitHub.**

Toute modification poussée vers la branche `main` sera automatiquement déployée sur Netlify.

**Workflow de déploiement :**
```bash
# 1. Faire les modifications dans les fichiers
# 2. Ajouter les changements
git add .

# 3. Créer un commit avec un message descriptif
git commit -m "Description des changements"

# 4. Pousser vers GitHub
git push

# 5. Netlify déploie automatiquement en ~2 minutes
```

Pour connecter un nouveau dépôt à Netlify :
1. Allez dans **Site settings > Build & deploy > Continuous deployment**
2. Cliquez sur **Link to repository**
3. Sélectionnez GitHub et autorisez l'accès
4. Choisissez le repository `oakleyjackie-max/cabane-crete-au-sirop`
5. Netlify détectera automatiquement les paramètres via `netlify.toml`

### Option 3: Déploiement manuel

1. Exécutez `npm run build`
2. Glissez-déposez le dossier `dist/` sur [app.netlify.com](https://app.netlify.com)

### Configuration du build (netlify.toml)

| Paramètre | Valeur |
|---|---|
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node version | 18 |
| Redirects | `/* → /index.html` (SPA) |

### Configuration des notifications par courriel

Après le déploiement :

1. Allez dans **Site settings > Forms > Form notifications**
2. Cliquez sur **Add notification > Email notification**
3. Sélectionnez le formulaire `reservation`
4. Entrez l'adresse : `oakley.jackie@gmail.com`
5. Sauvegardez

### Variables d'environnement (obligatoires)

Configurez ces variables dans **Site configuration > Environment variables** sur Netlify :

| Variable | Description |
|---|---|
| `ADMIN_PASSWORD_HASH` | Hash bcrypt du mot de passe admin initial (recommandé). Générez-en un avec : `npx bcryptjs-cli hash "votre-mot-de-passe"`. Note : un mot de passe changé via le panneau admin (stocké en blob) prend priorité. |
| `ADMIN_PASSWORD` | Mot de passe en clair (fallback si aucun hash n'est défini — **déconseillé**) |
| `ADMIN_JWT_SECRET` | Secret aléatoire pour signer les tokens JWT (min. 32 caractères). Générez-en un avec : `openssl rand -base64 48` |

## Images requises

Ajoutez les images suivantes dans `public/images/`:

- `logo.png` - Logo de l'entreprise (carré, minimum 120x120px)
- `background.png` - Image de fond (sera affichée en transparence)
- `product-can.jpg` - Photo de la canne 540ml
- `product-case.jpg` - Photo de la caisse de 8 cannes

## Personnalisation du contenu

Le texte peut être modifié dans `src/App.jsx`. Recherchez les commentaires `PLACEHOLDER` pour trouver les sections à personnaliser:

- Slogan
- Texte d'introduction
- Descriptions des produits
- Arguments de vente (hooks)
- Coordonnées dans le pied de page

## Panneau d'administration

Cliquez sur l'icône ⚙ en bas à droite de la page pour accéder au panneau d'administration.

### Authentification

- La connexion admin est gérée côté serveur via des Netlify Functions et des tokens JWT (durée de 8 heures).
- Le mot de passe est défini via la variable `ADMIN_PASSWORD_HASH` (bcrypt) sur Netlify. Pour le modifier, changez la variable dans le tableau de bord Netlify.
- Plusieurs administrateurs peuvent se connecter avec le même mot de passe depuis différents appareils.
- Les tentatives de connexion sont limitées à 5 par 15 minutes par adresse IP.

### Changement de mot de passe

- Dans le panneau admin, cliquez sur **🔑 Mot de passe** pour changer le mot de passe administrateur.
- Le nouveau mot de passe est stocké côté serveur (Netlify Blobs) et prend priorité sur les variables d'environnement.
- Le mot de passe doit contenir au moins 8 caractères.

### Réinitialisation du mot de passe (question de sécurité)

- Dans le panneau admin, cliquez sur **🔐 Question Sécurité** pour configurer une question et une réponse secrète.
- Si un admin oublie le mot de passe, il clique sur l'icône **🔒** en bas à droite (à côté de ⚙), puis répond à la question de sécurité.
- Après vérification, l'admin peut définir un nouveau mot de passe directement dans la fenêtre de réinitialisation.
- La réponse est hashée avec bcrypt et stockée en minuscules (insensible à la casse).

### Sécurité

- **Mots de passe** : hashés avec bcrypt (salt factor 10)
- **Tokens JWT** : signés HS256, expiration 8h, validation issuer/audience
- **Rate limiting** : login, réinitialisation, et soumission de réservations (5 tentatives / 15 min)
- **Validation des entrées** : sanitisation côté serveur (longueurs max, regex email/téléphone)
- **Protection CSV** : prévention d'injection de formules dans les exports
- **En-têtes de sécurité** : CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff
- **Question de sécurité** : réponse hashée avec bcrypt

### Barre d'outils admin

Tous les contrôles admin sont regroupés sur une seule barre en haut du panneau, sous forme de boutons bascule (vert = actif, rouge = inactif) :

| Bouton | Description |
|---|---|
| **En saison** / **Hors saison** | Bascule le mode hors-saison (vert = saison en cours, rouge = hors-saison) |
| **Notifications** | Active/désactive les alertes de nouvelles réservations (vérification toutes les 30 secondes) |
| **CSV** | Ouvre les filtres d'exportation CSV |
| **🔐 Question Sécurité** | Configure la question de sécurité pour la réinitialisation |
| **🔑 Mot de passe** | Changer le mot de passe administrateur depuis le panneau |
| **Connecté** | Indique la session active (cliquer pour se déconnecter) |

### Paramètres partagés

Les paramètres suivants sont stockés côté serveur (Netlify Blobs) et synchronisés entre tous les appareils admin :

- **Mode hors-saison** (out-of-stock) — visible par tous les visiteurs
- **Notifications navigateur** — état partagé entre admins
- **Question de sécurité** — partagée entre admins pour la réinitialisation
- **Réservations** — stockées côté serveur, avec cache localStorage en fallback

### Exportation CSV des réservations

Le panneau d'administration offre un outil d'exportation CSV avec filtres :

1. Cliquez sur **CSV** dans la barre d'outils
2. Filtrez par **plage de dates** (Du / Au) et/ou par **statut** (Réservé, En traitement, Prêt, etc.)
3. Le bouton **Télécharger CSV** affiche le nombre de réservations correspondantes
4. Cliquez pour télécharger le fichier `.csv` (encodage UTF-8 avec BOM pour Excel)
5. Utilisez **Réinitialiser** pour effacer les filtres

Le CSV inclut : numéro, date/heure, nom, téléphone, courriel, produits, quantité, instructions spéciales et statut.

## Palette de couleurs

- Orange principal: `#D2691E`
- Brun foncé: `#8B4513`
- Crème: `#F5DEB3`
