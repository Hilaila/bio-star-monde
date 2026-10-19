# Guide du promoteur — M. ZOUGBA NATHANAËL

Ce guide liste ce que vous seul pouvez faire, parce que cela se fait avec votre compte Pi et votre identité. Tout le reste (serveur, code, intégration) est pris en charge par Hilaila.

**Règle absolue :** ne communiquez jamais votre phrase secrète (passphrase) Pi, à personne, Hilaila compris. Personne n'en a besoin pour développer l'application.

## Étape 1 — Vérifier votre compte Pi (aujourd'hui)

1. Dans l'application Pi, vérifiez que votre KYC est **validé**.
2. Vérifiez que votre portefeuille a bien reçu sa **migration vers le Mainnet**.
3. Installez le **Pi Browser** si ce n'est pas déjà fait.

Sans KYC validé, l'application ne pourra pas être référencée.

## Étape 2 — Créer l'application de test

1. Ouvrez le Pi Browser et tapez **develop.pi** dans la barre d'adresse : c'est le Developer Portal.
2. Créez une nouvelle application avec ces informations :
   - Nom : **Bio Star Monde Éden**
   - Réseau : **Pi Testnet** (ce choix ne peut plus être modifié ensuite)
   - Hébergement : auto-hébergé
   - URL : celle que Hilaila vous communiquera
3. Dans la page de l'application, récupérez la **clé API**.
4. Transmettez cette clé à Hilaila de façon sûre : de vive voix ou par message chiffré, puis supprimez le message.

## Étape 2 bis — Hébergement

L'application est hébergée gratuitement sur Appwrite par Hilaila (procédure : [DEPLOIEMENT_APPWRITE.md](DEPLOIEMENT_APPWRITE.md)). Votre seule action : recopier dans le champ **Production URL** de l'application Testnet l'adresse que Hilaila vous communiquera (elle se termine par `.appwrite.run`). Le transfert de l'hébergement à votre nom est prévu dans l'accord.

## Étape 2 ter — Votre espace d'administration

1. Communiquez à Hilaila votre **nom d'utilisateur Pi** (celui qui s'affiche dans l'application Pi, sans @). Ce n'est pas un secret.
2. Hilaila l'enregistre dans l'hébergement.
3. Dans le Pi Browser, ouvrez l'application, appuyez sur **Connexion Pi**, puis sur **Administration** : vous voyez toutes les inscriptions, leur état et les recettes par offre.
4. Chaque apprenant retrouve ses propres achats dans **Mes inscriptions**, avec une référence de paiement à vous indiquer par e-mail.

## Étape 3 — Valider les contenus (à envoyer à Hilaila)

Répondez « validé » ou envoyez vos corrections pour :

1. **Le catalogue** (`core/catalogue.json`) : 9 formations et 3 services tirés de votre présentation. Vérifiez les intitulés, les durées et les modalités.
2. **Vos prix réels en FCFA**, pour chaque offre. Ils serviront à calculer les prix en Pi du Mainnet.
3. **Les conditions d'utilisation et de vente** (`public/terms.html`), en particulier la règle en cas d'erreur de paiement.
4. **La politique de confidentialité** (`public/privacy.html`).

## Étape 4 — Ouvrir sur le Mainnet (après les essais réussis)

1. Dans le Developer Portal, créez une seconde application sur le **Mainnet** et reliez-la à l'application de test.
2. Le portail vous donne une **clé de validation du domaine** : transmettez-la à Hilaila.
3. Connectez le **portefeuille de l'application** depuis le portail. C'est lui qui recevra les paiements en Pi.
4. Générez une **nouvelle clé API** Mainnet et transmettez-la à Hilaila de façon sûre.
5. Après un paiement réel de petit montant réussi, demandez le référencement depuis le portail.

## Démarches hors de Pi

- [ ] Autorisation d'ouverture d'une école privée de formation professionnelle en agriculture et/ou en élevage (démarche gratuite sur service-public.gov.bf).
- [ ] Déclaration du traitement des données auprès de la Commission de l'informatique et des libertés (CIL) du Burkina Faso.
- [ ] Accord écrit avec Hilaila : droits sur le code, développement, maintenance, accès (voir [GOUVERNANCE.md](GOUVERNANCE.md)).
- [ ] Avis d'un expert-comptable sur l'enregistrement des recettes en Pi.

## Contact technique

Hilaila — développement et maintenance de l'application.
