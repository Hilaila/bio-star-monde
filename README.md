# BIO STAR MONDE ÉDEN

### Institut International Moderne Innovant Biologique d’Agriculture et d’Élevage

**Devise :** Former, Innover, Produire et Commercialiser pour un Monde Agro-Biologique Durable.

## 1. Présentation du projet

Bio Star Monde Éden est un projet consacré à la promotion de l’agrobiologie, de l’agriculture durable, de l’élevage responsable et de la valorisation des ressources naturelles.

Son ambition est de contribuer à la sécurité alimentaire, à la protection de l’environnement, à la formation et au développement d’activités agricoles durables en Afrique et dans le monde.

Le projet entend favoriser la transmission des connaissances, l’innovation agricole, l’entrepreneuriat rural et la mise en relation des acteurs du secteur agrobiologique.

## 2. Organisation du projet

| Élément | Responsable |
| --- | --- |
| Promoteur de Bio Star Monde Éden | M. ZOUGBA NATHANAËL |
| Propriété du projet et droits associés | M. ZOUGBA NATHANAËL, selon l’accord entre les parties |
| Compte Pi Developer Portal | M. ZOUGBA NATHANAËL, promoteur enregistré |
| Dépôt GitHub et gestion technique | Hilaila |
| Développement et maintenance | Hilaila, selon l’accord entre les parties |
| Contact officiel | [zoubgaefils@gmail.com](mailto:zoubgaefils@gmail.com) |

**Pays d’implantation envisagé :** Burkina Faso.

Le dépôt GitHub constitue un espace technique de développement et de suivi du code. Son hébergement sous le compte GitHub Hilaila ne détermine pas, à lui seul, la propriété juridique du projet ni les droits de propriété intellectuelle associés. Comptes, clés, règles de sécurité et points de l’accord : voir [GOUVERNANCE.md](GOUVERNANCE.md). Actions réservées au promoteur sur Pi et validations attendues : voir [GUIDE_PROMOTEUR.md](GUIDE_PROMOTEUR.md). Modules et liens entre les activités : voir [ARCHITECTURE_MODULES.md](ARCHITECTURE_MODULES.md).

## 3. Vision

Contribuer à l’émergence d’un pôle d’excellence agrobiologique associant formation, innovation, production, élevage et commercialisation dans une démarche respectueuse de la nature.

## 4. Missions et objectifs

- Promouvoir les pratiques agrobiologiques et agricoles durables.
- Encourager la formation et le partage des connaissances.
- Valoriser les productions agricoles et les activités d’élevage.
- Sensibiliser à la protection des sols, de l’eau et de la biodiversité.
- Favoriser l’entrepreneuriat agricole et les partenariats.
- Soutenir la commercialisation responsable des produits, lorsque les services correspondants seront opérationnels.

## 5. Application numérique — version de démarrage

Cette base comprend une interface web responsive en français, un serveur Node.js, un catalogue de 12 formations et services tirés de la présentation de l’Institut (`core/catalogue.json`), une base SQLite, une politique de confidentialité et des conditions d’utilisation et de vente, ainsi que l’intégration Pi (connexion, paiements, paiements incomplets).

Modules ouverts dans la version 1.7 :

| Module | Ce que l’utilisateur peut faire |
| --- | --- |
| BioStar Academy | Suivre les leçons des 9 formations (`core/academy.json`) après inscription payée en Pi, faire valider le module pratique par le formateur, recevoir une attestation `ATT-XXXXXXXX` avec code QR, vérifiable sur `attestation.html`. |
| BioSmart | Consulter le calendrier agricole (Burkina Faso, Sud-Togo), calculer 6 recettes de bio-intrants selon la surface, établir un diagnostic par symptômes (10 cas) et demander l’avis d’un conseiller, qui répond depuis l’Administration. |
| BioFarm Manager · BioTrace | Fiche d’exploitation, parcelles, lots, étapes, page publique du lot ; les attestations obtenues y figurent si le producteur l’accepte. |
| BioImpact | Estimer le carbone stocké par 4 pratiques (estimation indicative, sans crédit carbone). |
| Contact | Écrire à l’Institut sans quitter l’application. |
| Administration | Inscriptions et recettes, validations pratiques, réponses aux demandes de conseil, messages reçus. |

Dossier pour la fiche de l’application dans Pi (logo 1024 px, 5 captures, descriptions, conformité) : [docs/fiche-pi/DOSSIER_SOUMISSION_PI.md](docs/fiche-pi/DOSSIER_SOUMISSION_PI.md). Le catalogue, les prix et les pages légales sont des propositions à valider par le promoteur ; les montants sont en Pi de test.

**Cette version n’est pas prête pour une mise en production sans configuration et vérifications supplémentaires.** Il manque notamment une véritable interface d’administration avec rôles sécurisés, la validation juridique des pages de confidentialité et de conditions, les données réelles de l’organisation et les essais Pi sur l’environnement autorisé. Aucune fonctionnalité non implémentée ou non vérifiée ne doit être présentée comme opérationnelle.

### Architecture

| Partie | Production (Appwrite, gratuit) | Local ou Docker |
| --- | --- | --- |
| Pages (`public/`) | Fonction Appwrite (`appwrite/main.js`) | Serveur Node (`server/index.js`) |
| API Pi et paiements | Même fonction, cœur commun `core/handler.js` | Serveur Node, même cœur |
| Base de données | Appwrite TablesDB, base `biostar`, table `orders`, créée automatiquement | SQLite (`data/biostar.db`) |

Une seule fonction sert les pages et l’API sur le même domaine. Elle se redéploie à chaque envoi sur `main`. Procédure pas à pas : [DEPLOIEMENT_APPWRITE.md](DEPLOIEMENT_APPWRITE.md).

### Prérequis et lancement local

1. Node.js **22.13 ou ultérieur**.
2. Copier `.env.example` vers `.env`.
3. Remplacer `SESSION_SECRET` par une valeur aléatoire forte avant tout déploiement.
4. Lancer `npm start`, puis ouvrir `http://localhost:3000`.
5. Pour tester la syntaxe du serveur : `npm run check`.
6. Pour lancer les tests (paiements, espaces, exploitation, lots, traçabilité, académie, attestations, conseil, messages, fonction Appwrite) : `npm test`.

Ne publiez jamais le fichier `.env`, les clés API, les mots de passe ou d’autres secrets.

### Mise en service sur Pi Network

| Étape | Action | Responsable |
| --- | --- | --- |
| 1 | KYC validé, portefeuille Mainnet migré, Developer Portal ouvert (`develop.pi` dans le Pi Browser). | M. ZOUGBA NATHANAËL |
| 2 | Enregistrer l’application **Testnet**, déclarer les URL, transmettre la clé API Testnet. | M. ZOUGBA NATHANAËL, avec Hilaila |
| 3 | Mettre en ligne la fonction Appwrite (voir DEPLOIEMENT_APPWRITE.md), puis tester dans le Pi Browser. | Hilaila |
| 4 | Valider connexion, paiement, annulation et paiement incomplet. | Hilaila |
| 5 | Valider le catalogue (`core/catalogue.json`), les prix en FCFA, les conditions et la politique de confidentialité. | M. ZOUGBA NATHANAËL ; intégration par Hilaila |
| 6 | Créer l’application **Mainnet**, vérifier le domaine (`PI_VALIDATION_KEY`), connecter le portefeuille, générer une nouvelle clé API, passer `PI_NETWORK=mainnet`. | M. ZOUGBA NATHANAËL ; serveur par Hilaila |
| 7 | Tester un vrai paiement de petit montant, puis demander le référencement. | Les deux |

Variables Pi du fichier `.env` :

- `PI_API_KEY` : clé API serveur de l’application (Testnet, puis Mainnet).
- `PI_SANDBOX` : `true` uniquement pour tester dans le Sandbox sur ordinateur ; `false` dans le Pi Browser.
- `PI_NETWORK` : `testnet` ou `mainnet` (affichage et état technique).
- `PI_VALIDATION_KEY` : clé de vérification du domaine fournie par le Developer Portal.
- `ADMIN_USERNAMES` : noms d’utilisateur Pi autorisés à ouvrir l’espace Administration, séparés par des virgules (sans @). Vide : espace désactivé.
- `FRAME_ANCESTORS` : origines autorisées à afficher l’application dans un cadre (Sandbox et Pi Browser). Valeur par défaut : `'self' https://*.minepi.com https://*.pinet.com`.

Liste de contrôle avant soumission : [PI_APPROVAL_CHECKLIST.md](PI_APPROVAL_CHECKLIST.md). Cette base ne garantit pas l’approbation de Pi.

### Endpoints

- `GET /healthz` — état technique.
- `GET /api/config` — réglages publics du SDK Pi (Sandbox, réseau).
- `GET /api/products` — catalogue (`core/catalogue.json`).
- `GET /api/setup` — préparation de la base Appwrite (version Appwrite uniquement).
- `GET /api/me` — état de connexion indicatif.
- `POST /api/pi-auth` — validation du jeton Pi côté serveur.
- `POST /api/payments/approve` — approbation d’un paiement.
- `POST /api/payments/complete` — finalisation d’un paiement.
- `POST /api/payments/incomplete` — reprise d’un paiement resté incomplet.
- `POST /api/payments/cancel` — annulation côté application.
- `POST /api/my-orders` — inscriptions du compte Pi connecté (espace « Mes inscriptions »).
- `POST /api/farm` — fiche d’exploitation, parcelles, lots et étapes du compte Pi connecté.
- `POST /api/farm/save` — création ou modification de la fiche d’exploitation.
- `POST /api/plots/save` — création ou modification d’une parcelle.
- `POST /api/lots/create` — création d’un lot et de son code `BSME-XXXXXXXX`.
- `POST /api/lots/event` — ajout d’une étape à un lot (jamais modifiée ni effacée).
- `GET /api/trace?code=BSME-XXXXXXXX` — traçabilité publique d’un lot, sans donnée de compte (page `lot.html`, code QR).
- `POST /api/admin/orders` — toutes les inscriptions et les recettes, réservé aux comptes de `ADMIN_USERNAMES`.
- `POST /api/academy` — formations, modules, progression et attestations du compte (leçons réservées aux inscrits).
- `POST /api/academy/progress` — module terminé, demande de validation pratique ou annulation.
- `GET /api/attestation?code=ATT-XXXXXXXX` — vérification publique d’une attestation (page `attestation.html`, code QR).
- `POST /api/advice` et `POST /api/advice/mine` — demandes d’avis à un conseiller (BioSmart) et leurs réponses.
- `POST /api/contact` — message à l’Institut.
- `POST /api/admin/academy` — validations pratiques en attente, demandes de conseil et messages, réservé aux comptes de `ADMIN_USERNAMES`.
- `POST /api/admin/validate` — validation ou refus d’un module pratique ; délivre l’attestation quand la formation est terminée.
- `POST /api/admin/answer` — réponse à une demande de conseil.

## 6. Contact officiel

Pour toute information concernant Bio Star Monde Éden :

**M. ZOUGBA NATHANAËL**, promoteur — [zoubgaefils@gmail.com](mailto:zoubgaefils@gmail.com)

Développement et maintenance : Hilaila.

---

*Bio Star Monde Éden — Former, Innover, Produire et Commercialiser pour un Monde Agro-Biologique Durable.*
