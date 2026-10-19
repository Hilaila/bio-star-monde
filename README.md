# Bio Star Monde Eden

Application Pi Network de l'**Institut international moderne innovant biologique d'agriculture et d'élevage** (siège au Burkina Faso).

- Promoteur et propriétaire : **M. ZOUGBA Nathanaël**, Lomé (Togo), zoubgaefils@gmail.com
- Gestion technique, développement et maintenance : **Hilaila**
- Dépôt : https://github.com/Hilaila/bio-star-monde
- Version : 1.0.0
- Gouvernance, comptes et rôles : [GOUVERNANCE.md](GOUVERNANCE.md) · actions du promoteur : [GUIDE_PROMOTEUR.md](GUIDE_PROMOTEUR.md)

## Ce que fait l'application

| Écran | Fonctions |
| --- | --- |
| Accueil | Calendrier agricole Sahel burkinabè et Sud-Togo, conseil de saison, suivi de formation, chiffres de l'institut, fermes-écoles, contact du promoteur |
| Académie | 4 parcours certifiants (18 modules avec leur leçon), progression enregistrée, modules pratiques validés par le formateur, certificat délivré automatiquement avec QR code vérifiable |
| Bio-Lab | 6 recettes de bio-intrants avec calcul des quantités, diagnostic par symptômes (10 cas), demande au conseiller avec photo et réponse dans l'application |
| Marché | Produits des fermes-écoles avec passeport de production, panier, **paiement en Pi**, historique des achats, offres des producteurs vérifiées avant publication |
| Carbone | Simulateur indicatif du carbone stocké par 4 pratiques |
| Administration (`/admin.html`) | Validations pratiques, réponses aux demandes, vérification des offres, prix en Pi, commandes, messages |
| Vérification (`/verify/<code>`) | Page publique qui confirme un certificat, sans compte |

L'application fonctionne aussi sans réseau (leçons, recettes, diagnostic, carbone) grâce à son service worker.

## Conformité Pi

- Connexion **uniquement** par `Pi.authenticate` ; le jeton est vérifié côté serveur auprès de `https://api.minepi.com/v2/me`.
- Paiements **uniquement en Pi** par `Pi.createPayment` ; approbation et finalisation faites par le serveur avec la clé `PI_API_KEY`, qui ne quitte jamais le serveur.
- Le montant est recalculé par le serveur à partir du catalogue, puis comparé au paiement renvoyé par Pi (utilisateur, montant, réseau).
- Les paiements inachevés (`onIncompletePaymentFound`) sont finalisés seulement si la transaction porte bien l'identifiant du paiement en mémo sur la blockchain, sinon annulés.
- Aucun lien vers un site extérieur, aucune donnée superflue : seuls l'identifiant d'application et le nom d'utilisateur Pi sont conservés.
- Clé de validation du domaine servie à `/validation-key.txt` depuis la variable `VALIDATION_KEY`.

Le détail est dans `docs/DOSSIER-SOUMISSION-PI.md`.

## Architecture

```
public/            interface (HTML, CSS, JS sans framework), service worker, pages légales, icônes
  index.html       application
  assets/app.js    logique de l'interface et intégration du SDK Pi
  admin.html       espace d'administration
  verify.html      vérification publique des certificats
  data/catalog.json  parcours, modules et leçons (modifiables sans toucher au code)
lib/
  router.js        toutes les routes de l'API
  pi.js            client de l'API Pi (/me, paiements, vérification Horizon)
  db.js            Supabase (production) ou mémoire (développement)
  session.js       sessions signées HMAC
  qr.js            générateur de QR code sans dépendance
api/index.js       point d'entrée unique sur Vercel
server.js          serveur Node.js autonome (local, Render, Railway…)
supabase/schema.sql  tables, contraintes, sécurité par ligne, produits de départ
tests/api.test.js  tests de bout en bout contre une fausse API Pi
scripts/mock-pi.js fausse API Pi pour la démonstration locale (ne jamais déployer)
```

Aucune dépendance npm : Node.js 20 ou plus suffit.

## Lancer en local

Avec une fausse API Pi (démonstration complète sans compte Pi), dans deux terminaux :

```bash
PORT=4100 node scripts/mock-pi.js
```

```bash
PI_API_BASE=http://127.0.0.1:4100/v2 PI_API_KEY=test PI_HORIZON_HOSTS=127.0.0.1:4100 ADMIN_TOKEN=admin npm start
```

Puis ouvrez http://localhost:3000 et http://localhost:3000/admin.html (jeton : `admin`).
Hors Pi Browser, l'application s'ouvre en mode consultation : la connexion et le paiement exigent Pi Browser ou le bac à sable Pi (`PI_SANDBOX=true`).

## Tests

```bash
npm test
```

9 tests couvrent : santé et clé de validation, pages et protections, connexion Pi, paiement complet, paiements frauduleux (montant, utilisateur, réseau), paiements inachevés, formation et certificat, offres des producteurs, demandes au conseiller.

## Déploiement

Voir `docs/DEPLOIEMENT.md` : Supabase, Vercel, Pi Developer Portal, Testnet puis Mainnet.
