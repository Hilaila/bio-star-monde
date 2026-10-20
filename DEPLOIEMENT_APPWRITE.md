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
   - `ADMIN_USERNAMES` = `4Nathanel`, nom d’utilisateur Pi de M. ZOUBGA NATHANAËL, sans @, et lui seul (décision du promoteur du 20 octobre 2026).
2. **Timeout** : 30 secondes.
3. Onglet **Deployments**, menu ⋯ du dernier déploiement, puis **Redeploy** : les variables ne s'appliquent qu'après un redéploiement.

## 4. Vérifier

1. Onglet **Domains** : copiez l'adresse de la fonction (elle se termine par `.appwrite.run`).
2. Ouvrez `https://<adresse>/api/health` : la réponse doit contenir `"piApiKeyConfigured":true` et, une fois `ADMIN_USERNAMES` saisie, `"adminConfigured":true`.
3. Ouvrez une fois `https://<adresse>/api/setup` : la réponse `"ok":true` confirme que la base et la table des commandes sont prêtes.
4. Ouvrez `https://<adresse>/` : la page d'accueil et le catalogue s'affichent.

## 5. Brancher sur Pi

1. M. ZOUBGA NATHANAËL recopie l'adresse dans le champ **Production URL** de l'application Testnet sur develop.pi.
2. Dans le Pi Browser, ouvrez l'application, appuyez sur **Connexion Pi**, puis payez une petite offre (0,2 ou 0,3 Pi de test) avec un portefeuille Testnet.
3. Après le paiement : la section **Mes inscriptions** affiche l’inscription « Confirmée ». Avec le compte de M. ZOUBGA, la section **Administration** affiche les recettes.
4. En cas d'erreur : onglet **Executions** de la fonction, pour lire les journaux.

## 6. Après chaque nouvelle version

1. Attendez que le déploiement soit **Ready** (onglet **Deployments**).
2. Ouvrez une fois `https://bio-star-monde.fra.appwrite.run/api/setup` : il crée les tables ajoutées par la version sans toucher aux commandes. La version 1.7 ajoute : progression, attestations, demandes de conseil et messages. Si la réponse tarde, ouvrez-la une seconde fois.

## 7. Deux adresses : test (Testnet) et production (Mainnet)

Pi ne vérifie une adresse que pour une seule application. On garde `https://bio-star-monde.fra.appwrite.run` pour l'application **Mainnet** ; l'application **Testnet** a sa propre adresse, `https://bio-star-monde-test.fra.appwrite.run` (fonction `bio-star-monde-test`, créée le 20 octobre 2026).

Le forfait gratuit d'Appwrite n'autorise qu'**une base de données par projet** et **deux fonctions** : les deux fonctions utilisent la base `biostar`. Tant que les deux adresses servent le Testnet, elles partagent les mêmes tables. Au passage au Mainnet, la production reçoit ses propres tables, neuves, grâce au préfixe `main_` : aucune donnée de test ne se mélange aux vraies.

1. **Functions**, bouton **+**, **Connect** sur `Hilaila/bio-star-monde` :
   - Name : `bio-star-monde-test` ; ID : automatique ; Runtime : Node.js 22 ; Publique (Execute access : Any) : activé ; Compute : valeur par défaut ;
   - Domaine : « Calcul de région » (Region), sous-domaine `bio-star-monde-test` ;
   - Branch : `main` ; Root directory : `./` ; Entrypoint : `appwrite/main.js` ; Build commands : vide.
2. Variables (dès la création, ou onglet **Variables**) :
   - `PI_API_KEY` = clé API de l'application **Testnet** (cochez **Secret**) ;
   - `PI_NETWORK` = `testnet` ;
   - `APPWRITE_DATABASE_ID` = `biostar` ;
   - `ADMIN_USERNAMES` = `4Nathanel`, nom d'utilisateur Pi de M. ZOUBGA NATHANAËL, et lui seul ;
   - `PI_VALIDATION_KEY` = clé « Verify domain » de l'application **Testnet**. Ne la mettez jamais sur la fonction d'origine : l'adresse de production serait alors vérifiée pour le Testnet.
3. Onglet **Settings** : rechercher `scopes` (catégorie Executions), cocher la seule catégorie **Databases** (27 autorisations), **Update** ; rechercher `timeout` (catégorie Runtime), mettre `30`, **Update**.
4. Onglet **Deployments** : **Redeploy**, puis ouvrir une fois `https://bio-star-monde-test.fra.appwrite.run/api/setup`. La réponse doit commencer par « Base prête : biostar ».
5. Sur develop.pi, M. ZOUBGA remplace l'adresse de l'application **Testnet** (onglet **Domain**) par `https://bio-star-monde-test.fra.appwrite.run`, puis appuie sur **Verify**.
6. Quand l'application **Mainnet** existe, la fonction d'origine `bio-star-monde` devient la production : `PI_API_KEY` = clé de l'application Mainnet, `PI_NETWORK` = `mainnet`, `PI_VALIDATION_KEY` = clé « Verify domain » de l'application Mainnet, `APPWRITE_TABLE_PREFIX` = `main_` (tables neuves `main_orders`, `main_farms`…, sans aucune commande de test). **Redeploy**, puis ouvrez une fois `https://bio-star-monde.fra.appwrite.run/api/setup` : la réponse commence par « Base prête : biostar, tables main_* ».

Avec un forfait payant, `APPWRITE_DATABASE_ID` peut aussi désigner une base séparée (par exemple `biostar_mainnet`) à la place du préfixe.

Les deux fonctions se mettent à jour ensemble à chaque envoi sur `main`.

## À savoir

- Offre gratuite : un projet sans activité de développement dans la console pendant 7 jours est mis en pause. Il se réactive depuis la console. Avant le Mainnet, prévoyez l'offre Pro ou une visite régulière de la console.
- Offre gratuite : un compte n'a qu'une organisation, et seul son créateur garde les droits d'administration.
- La clé API Pi est saisie comme variable **secrète** : elle n'est plus lisible ensuite, ni dans la console, ni par l'API.
