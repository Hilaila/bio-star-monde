# Déploiement de Bio Star Monde Eden

Ordre à suivre : **Supabase → GitHub → Vercel → Pi Developer Portal (Testnet) → tests → Mainnet**.
Comptez environ 1 h 30 pour la mise en ligne Testnet.

Rôles :
- **M. ZOUGBA Nathanaël** possède le compte Supabase et le compte Pi Developer Portal de l'application.
- **Hilaila** gère le dépôt GitHub, l'hébergement Vercel et la maintenance, avec un accès « Developer » à Supabase.

Pi exige une application distincte pour le Testnet et pour le Mainnet, chacune avec sa propre adresse et son propre portefeuille. On crée donc deux environnements :

| Environnement | Projet Supabase | Projet Vercel | Adresse |
| --- | --- | --- | --- |
| Testnet (essais) | bsme-testnet | bio-star-monde-testnet | https://bio-star-monde-testnet.vercel.app |
| Mainnet (public) | bsme-production | bio-star-monde | https://bio-star-monde.vercel.app |

Si Vercel attribue une autre adresse (nom déjà pris), utilisez celle qu'il affiche partout où ce guide cite l'adresse.

---

## 1. Base de données Supabase (compte de M. ZOUGBA)

1. Ouvrez https://supabase.com/dashboard avec le compte de M. ZOUGBA.
2. Cliquez « New project ». Nom : `bsme-testnet`. Région : `West EU (Paris)`, la plus proche de l'Afrique de l'Ouest. Notez le mot de passe de la base dans un endroit sûr.
3. Une fois le projet prêt, ouvrez « SQL Editor », puis « New query ».
4. Collez tout le contenu du fichier `supabase/schema.sql` et cliquez « Run ». Le message « Success » doit apparaître.
5. Ouvrez « Project Settings », puis « API Keys » (ou « API » selon l'interface). Notez :
   - l'adresse du projet (Project URL), de la forme `https://xxxxxxxx.supabase.co` ;
   - la clé secrète (`sb_secret_…`) ou, dans l'ancienne interface, la clé `service_role`.
6. Invitez Hilaila : « Organization settings », puis « Team », puis « Invite member », rôle **Developer**.

La clé secrète donne tous les droits sur la base. Elle ne va que dans les variables d'environnement de Vercel, jamais dans le code ni dans un message.

## 2. Dépôt GitHub (Hilaila)

1. Ouvrez https://github.com/Hilaila/bio-star-monde.
2. Envoyez-y tout le contenu du dossier du projet (le fichier `.env` ne doit jamais être envoyé ; il est exclu par `.gitignore`).

## 3. Hébergement Vercel

1. Ouvrez https://vercel.com/new et importez le dépôt `Hilaila/bio-star-monde`.
2. Nom du projet : `bio-star-monde-testnet`. Framework Preset : **Other**. Laissez les commandes de build vides : `vercel.json` règle déjà tout (dossier `public`, fonction `api/index.js`).
3. Avant de déployer, ouvrez « Environment Variables » et ajoutez :

| Variable | Valeur Testnet |
| --- | --- |
| `SUPABASE_URL` | l'adresse du projet `bsme-testnet` |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé secrète de `bsme-testnet` |
| `SESSION_SECRET` | 64 caractères aléatoires (voir ci-dessous) |
| `ADMIN_TOKEN` | un autre texte aléatoire, à garder secret |
| `ADMIN_USERNAMES` | `Hilaila,<nom d'utilisateur Pi de M. ZOUGBA>` |
| `APP_URL` | `https://bio-star-monde-testnet.vercel.app` |
| `PI_NETWORK` | `Pi Testnet` |
| `PI_SANDBOX` | `false` |
| `NODE_ENV` | `production` |
| `PI_API_KEY` | à remplir à l'étape 4 |
| `VALIDATION_KEY` | à remplir à l'étape 4 |

   Pour générer un secret aléatoire sur un ordinateur où Node.js est installé :
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Cliquez « Deploy ».
5. Vérifiez l'adresse https://bio-star-monde-testnet.vercel.app/api/health : elle doit afficher `"ok":true` et `"db":"supabase"`. Si elle affiche `"db":"memory"`, les variables Supabase sont absentes ou mal copiées.

Le plan gratuit Hobby de Vercel est réservé à un usage non commercial. Il convient pour le Testnet. Dès que le Marché encaisse des ventes réelles sur le Mainnet, passez le projet Mainnet au plan Pro de Vercel, ou hébergez-le sur un service qui autorise l'usage commercial : `server.js` fonctionne tel quel avec la commande `npm start`.

## 4. Pi Developer Portal, Testnet (compte Pi de M. ZOUGBA)

1. Sur le téléphone de M. ZOUGBA, ouvrez Pi Browser et créez un portefeuille Testnet : tapez `wallet.pi` dans la barre d'adresse et suivez les étapes.
2. Tapez `develop.pi` dans la barre d'adresse de Pi Browser, puis « Register a New App ».
3. Renseignez :
   - App name : `Bio Star Monde Eden` ;
   - Description : reprenez la description courte de `docs/DOSSIER-SOUMISSION-PI.md` ;
   - Network : **Pi Testnet** ;
   - Hosting : **Self hosted** ;
   - Production URL : `https://bio-star-monde-testnet.vercel.app` ;
   - Development URL : `http://localhost:3000`.
4. Dans la checklist de l'application, connectez le portefeuille Testnet créé au point 1.
5. Étape « Verify domain » : copiez le texte affiché dans le cadre gris. Dans Vercel, collez-le dans la variable `VALIDATION_KEY`, puis « Deployments », « Redeploy ». Vérifiez que https://bio-star-monde-testnet.vercel.app/validation-key.txt affiche exactement ce texte, puis cliquez « Verify domain » dans le portail. Une coche verte apparaît.
6. En bas du tableau de bord de l'application, section « API Keys » : générez la clé et collez-la dans la variable `PI_API_KEY` de Vercel, puis « Redeploy ».
7. Laissez « Whitelist users » vide pour que tout le monde puisse tester, ou ajoutez jusqu'à 10 noms d'utilisateur Pi.
8. Vérifiez https://bio-star-monde-testnet.vercel.app/api/health : `"piApiKey":true`.

## 5. Tests sur le Testnet, dans Pi Browser

Ouvrez l'application depuis le Developer Portal (bouton d'ouverture de l'app). Une bande noire et jaune en haut de l'écran signale le Testnet : c'est normal.

1. Touchez « Connexion Pi » et acceptez : votre nom d'utilisateur apparaît en haut à droite.
2. Académie : terminez les modules théoriques du parcours « Éleveur agro-écologique » et demandez la validation du module pratique.
3. Ouvrez https://bio-star-monde-testnet.vercel.app/admin.html, entrez `ADMIN_TOKEN`, validez le module : le certificat apparaît dans l'Académie.
4. Scannez le QR du certificat avec un autre téléphone : la page de vérification affiche « Certificat valide ».
5. Marché : ajoutez « Tomates rondes » (0,2 test-π), « Payer en Pi », confirmez dans le portefeuille. La commande passe à « Payée » dans « Mes achats » et dans l'administration.
6. Bio-Lab : envoyez une demande avec photo, répondez depuis l'administration, vérifiez la réponse dans « Mes demandes ».
7. Marché : publiez une offre, vérifiez-la et publiez-la depuis l'administration.

## 6. Passage au Mainnet

Conditions : le KYC Pi de M. ZOUGBA est validé, et tous les tests Testnet ci-dessus sont réussis.

1. Créez le projet Supabase `bsme-production` (étape 1 à l'identique).
2. Créez un second projet Vercel `bio-star-monde` à partir du même dépôt, avec les variables de l'étape 3, en remplaçant :
   - `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` par ceux de `bsme-production` ;
   - `APP_URL` par `https://bio-star-monde.vercel.app` ;
   - `PI_NETWORK` par `Pi Network` ;
   - de nouveaux `SESSION_SECRET` et `ADMIN_TOKEN`.
3. Dans `develop.pi`, enregistrez une **nouvelle** application `Bio Star Monde Eden`, Network **Pi Mainnet**, Production URL `https://bio-star-monde.vercel.app`.
4. Connectez le portefeuille Mainnet de M. ZOUGBA (demande « Apply for Mainnet App Wallet » si le portail la propose).
5. Refaites la vérification du domaine et la clé API avec les valeurs de cette nouvelle application (`VALIDATION_KEY`, `PI_API_KEY`), puis « Redeploy ».
6. Dans `/admin.html` de la production, vérifiez les prix en Pi de chaque produit avant d'ouvrir les ventes.
7. Faites un achat réel de faible montant pour vérifier toute la chaîne.
8. Soumettez la fiche de l'application à l'Ecosystem avec `docs/DOSSIER-SOUMISSION-PI.md`.

## Dépannage

| Symptôme | Cause et solution |
| --- | --- |
| « Connexion Pi » ouvre une fenêtre « Ouvrez l'application dans Pi Browser » | L'application est ouverte dans un navigateur ordinaire. Ouvrez-la dans Pi Browser. |
| « La clé serveur Pi (PI_API_KEY) n'est pas configurée » | Ajoutez `PI_API_KEY` dans Vercel, puis « Redeploy ». |
| « Votre session Pi a expiré » à la connexion | L'application est ouverte depuis une autre app du Developer Portal (Testnet et Mainnet sont séparés). Ouvrez-la depuis la bonne app. |
| « Réseau inattendu » au paiement | `PI_NETWORK` ne correspond pas au réseau de l'app : `Pi Testnet` ou `Pi Network`. |
| La vérification du domaine échoue | https://…/validation-key.txt doit afficher exactement le texte du portail, sans espace ajouté. Redéployez après avoir changé la variable. |
| `/api/health` affiche `"db":"memory"` | Variables Supabase absentes : les données seraient perdues. Corrigez avant toute utilisation réelle. |
| Erreur 500 « SESSION_SECRET manquant » | Ajoutez `SESSION_SECRET` dans Vercel, puis « Redeploy ». |

## Sécurité

- Ne publiez jamais `PI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` ni `ADMIN_TOKEN`. En cas de fuite, régénérez la clé concernée et redéployez.
- L'application ne demande jamais la phrase secrète d'un portefeuille Pi.
- `scripts/mock-pi.js` sert uniquement aux tests locaux. Ne le déployez jamais et ne mettez jamais `PI_API_BASE` en production.
