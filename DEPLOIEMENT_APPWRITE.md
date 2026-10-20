# Mise en ligne sur Appwrite (gratuit)

Une seule fonction Appwrite sert les pages, l'API Pi et la base de données. Elle se met à jour automatiquement à chaque envoi sur la branche `main` du dépôt GitHub.

## 1. Créer le projet

1. Sur **cloud.appwrite.io**, connectez-vous ou créez un compte (offre **Free**).
2. Créez un projet nommé **Bio Star Monde Éden**, région **Frankfurt**, la plus proche de l'Afrique de l'Ouest.

## 2. Créer la fonction reliée à GitHub

1. Menu **Functions**, puis **Create function**, et choisissez de partir d'un dépôt Git (**Connect Git repository**).
2. Autorisez Appwrite sur GitHub pour le dépôt `Hilaila/bio-star-monde`, puis sélectionnez-le.
3. Remplissez :
   - **Name** : `bio-star-monde`
   - **Runtime** : Node.js 22
   - **Production branch** : `main`
   - **Root directory** : `./`
   - **Entrypoint** : `appwrite/main.js`
   - **Build commands** : laissez vide (aucune dépendance à installer)
4. **Permissions** (accès à l'exécution) : **Any**, pour que tout le monde puisse ouvrir l'application.
5. **Scopes** : cochez toute la rubrique **Databases**, c'est-à-dire `databases`, `tables`, `columns`, `indexes` et `rows`, en lecture et en écriture.
6. Créez la fonction : le premier déploiement démarre.

## 3. Réglages de la fonction (onglet Settings)

1. **Environment variables**, puis **Create variable** :
   - `PI_API_KEY` = clé API de l'application Pi Testnet, en cochant **Secret** ;
   - `PI_NETWORK` = `testnet` ;
   - `ADMIN_USERNAMES` = nom d’utilisateur Pi de M. ZOUGBA NATHANAËL, sans @ (ajoutez celui de Hilaila après une virgule si l’accord le prévoit).
2. **Timeout** : 30 secondes.
3. Onglet **Deployments**, menu ⋯ du dernier déploiement, puis **Redeploy** : les variables ne s'appliquent qu'après un redéploiement.

## 4. Vérifier

1. Onglet **Domains** : copiez l'adresse de la fonction (elle se termine par `.appwrite.run`).
2. Ouvrez `https://<adresse>/api/health` : la réponse doit contenir `"piApiKeyConfigured":true` et, une fois `ADMIN_USERNAMES` saisie, `"adminConfigured":true`.
3. Ouvrez une fois `https://<adresse>/api/setup` : la réponse `"ok":true` confirme que la base et la table des commandes sont prêtes.
4. Ouvrez `https://<adresse>/` : la page d'accueil et le catalogue s'affichent.

## 5. Brancher sur Pi

1. M. ZOUGBA NATHANAËL recopie l'adresse dans le champ **Production URL** de l'application Testnet sur develop.pi.
2. Dans le Pi Browser, ouvrez l'application, appuyez sur **Connexion Pi**, puis payez une petite offre (0,2 ou 0,3 Pi de test) avec un portefeuille Testnet.
3. Après le paiement : la section **Mes inscriptions** affiche l’inscription « Confirmée ». Avec le compte de M. ZOUGBA, la section **Administration** affiche les recettes.
4. En cas d'erreur : onglet **Executions** de la fonction, pour lire les journaux.

## 6. Après chaque nouvelle version

1. Attendez que le déploiement soit **Ready** (onglet **Deployments**).
2. Ouvrez une fois `https://bio-star-monde.fra.appwrite.run/api/setup` : il crée les tables ajoutées par la version sans toucher aux commandes. La version 1.7 ajoute : progression, attestations, demandes de conseil et messages. Si la réponse tarde, ouvrez-la une seconde fois.

## 7. Deux adresses : test (Testnet) et production (Mainnet)

Pi ne vérifie une adresse que pour une seule application. On garde `https://bio-star-monde.fra.appwrite.run` pour l'application **Mainnet** et l'application **Testnet** reçoit sa propre adresse, avec sa propre base de données.

1. **Functions**, puis **Create function** : même dépôt et mêmes réglages qu'à l'étape 2, avec **Name** : `bio-star-monde-test`.
2. **Settings**, puis **Environment variables** :
   - `PI_API_KEY` = clé API de l'application **Testnet** (cochez **Secret**) ;
   - `PI_NETWORK` = `testnet` ;
   - `APPWRITE_DATABASE_ID` = `biostar_test` ;
   - `ADMIN_USERNAMES` = nom d'utilisateur Pi de M. ZOUGBA NATHANAËL (et celui de Hilaila si l'accord le prévoit) ;
   - `PI_VALIDATION_KEY` = clé « Verify domain » de l'application **Testnet**.
3. **Timeout** : 30 secondes, puis **Redeploy**.
4. Onglet **Domains** : copiez la nouvelle adresse et ouvrez une fois `<nouvelle adresse>/api/setup`. La réponse doit commencer par « Base prête : biostar_test ».
5. Sur develop.pi, M. ZOUGBA remplace l'adresse de l'application **Testnet** (onglet **Domain**) par la nouvelle, puis appuie sur **Verify**.
6. Quand l'application **Mainnet** existe, la fonction d'origine `bio-star-monde` devient la production : `PI_API_KEY` = clé de l'application Mainnet, `PI_NETWORK` = `mainnet`, `PI_VALIDATION_KEY` = clé « Verify domain » de l'application Mainnet, `APPWRITE_DATABASE_ID` = `biostar_mainnet` (base neuve, sans aucune commande de test). **Redeploy**, puis ouvrez une fois `https://bio-star-monde.fra.appwrite.run/api/setup`.

Les deux fonctions se mettent à jour ensemble à chaque envoi sur `main`.

## À savoir

- Offre gratuite : un projet sans activité de développement dans la console pendant 7 jours est mis en pause. Il se réactive depuis la console. Avant le Mainnet, prévoyez l'offre Pro ou une visite régulière de la console.
- Offre gratuite : un compte n'a qu'une organisation, et seul son créateur garde les droits d'administration.
- La clé API Pi est saisie comme variable **secrète** : elle n'est plus lisible ensuite, ni dans la console, ni par l'API.
