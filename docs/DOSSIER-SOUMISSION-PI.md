# Dossier de soumission à la Pi Core Team : Bio Star Monde Eden

Ce dossier rassemble tout ce qu'il faut saisir dans le Pi Developer Portal (`develop.pi`) et dans la demande de listing Ecosystem. Les textes destinés à l'équipe de revue sont fournis en français et en anglais : copiez-les tels quels.

## 1. Fiche de l'application

| Champ | Valeur |
| --- | --- |
| Nom de l'application | Bio Star Monde Eden |
| Version | 1.0.0 |
| Catégorie principale | Éducation (à défaut : Marketplace) |
| Propriétaire et développeur enregistré | ZOUGBA Nathanaël, promoteur de l'Institut international moderne innovant biologique d'agriculture et d'élevage |
| Maintenance technique | Hilaila |
| E-mail de contact | zoubgaefils@gmail.com |
| Pays | Burkina Faso (siège de l'institut), Togo (promoteur, ferme-école de Tsévié) |
| Langue | Français (textes légaux aussi en anglais) |
| Adresse Testnet | https://bio-star-monde-testnet.vercel.app |
| Adresse Mainnet | https://bio-star-monde.vercel.app |
| Politique de confidentialité | https://bio-star-monde.vercel.app/privacy.html |
| Conditions d'utilisation | https://bio-star-monde.vercel.app/terms.html |
| Authentification | Pi SDK uniquement : cochez « Pi SDK Exclusive Authentication » |
| Logo | `public/icons/logo-1024.png` (1024 × 1024 px, PNG, 51 Ko) |
| Captures d'écran | `docs/apercus/` : 5 images de 1080 × 1920 px |

## 2. Descriptions à coller

**Description courte (FR)**
> Formation agro-biologique certifiante, bio-intrants et marché bio payé en Pi.

**Short description (EN)**
> Certified organic farming training, bio-inputs and an organic market paid in Pi.

**Description longue (FR)**
> Bio Star Monde Eden est l'application de l'Institut international moderne innovant biologique d'agriculture et d'élevage, basé au Burkina Faso. Elle forme les jeunes, les femmes et les producteurs à l'agriculture et à l'élevage biologiques, à partir des ressources locales.
>
> - Académie : 4 parcours certifiants (maraîchage biologique, élevage agro-écologique, agroforesterie, agro-entrepreneuriat), des leçons lisibles même sans réseau, des modules pratiques validés par les formateurs des fermes-écoles, et un certificat vérifiable par QR code.
> - Bio-Lab : 6 recettes de bio-intrants (neem, piment-ail, compost, biochar, engrais liquide, désherbant) dosées selon la surface, un diagnostic des cultures et des volailles par symptômes, et des demandes au conseiller de terrain avec photo.
> - Marché bio : les produits des fermes-écoles avec leur passeport de production, payés en Pi.
> - Carbone : une estimation du carbone stocké par les pratiques de restauration des sols.
>
> Connexion uniquement avec votre compte Pi. Aucune publicité. Aucune donnée personnelle superflue.

**Long description (EN)**
> Bio Star Monde Eden is the app of the International Modern Innovative Organic Institute of Agriculture and Livestock, headquartered in Burkina Faso. It trains young people, women and farmers in organic farming and livestock using local resources.
>
> - Academy: 4 certified courses (organic market gardening, agro-ecological livestock, agroforestry, agri-entrepreneurship), lessons readable offline, practical modules validated by farm-school trainers, and a certificate verifiable by QR code.
> - Bio-Lab: 6 organic input recipes (neem, chilli-garlic, compost, biochar, liquid manure, vinegar weed killer) scaled to the farmer's area, symptom-based diagnosis for crops and poultry, and photo requests to a field adviser.
> - Organic market: farm-school products with a production passport, paid in Pi.
> - Carbon: an estimate of the carbon stored by soil restoration practices.
>
> Sign-in with Pi only. No ads. No unnecessary personal data.

## 3. Conformité aux exigences du listing Mainnet

| Exigence Pi | Mise en œuvre dans Bio Star Monde Eden |
| --- | --- |
| Application complète, interface professionnelle | 5 écrans fonctionnels, administration, page de vérification publique, thème clair et sombre, utilisable sans réseau. 9 tests automatisés de bout en bout (`npm test`). |
| KYC du développeur | À faire valider par M. ZOUGBA avant la soumission Mainnet. |
| Pas d'usage abusif de la marque Pi | Nom sans « Pi ». Domaine `bio-star-monde…`, qui ne commence pas par « pi ». Logo original (pousse indigo et blanche sur fond mil), sans logo ni couleurs officielles de Pi. |
| Authentification Pi uniquement | `Pi.authenticate(["username", "payments"], …)`. Aucun e-mail, mot de passe ni autre fournisseur. Le jeton est vérifié par le serveur auprès de `https://api.minepi.com/v2/me` (`lib/router.js`, route `/api/auth/signin`). |
| Transactions en Pi uniquement | Prix affichés et encaissés en Pi. `Pi.createPayment` côté interface ; `approve` et `complete` côté serveur avec la clé `PI_API_KEY`. Le montant est recalculé par le serveur et comparé au paiement Pi (utilisateur, montant, réseau). Les paiements inachevés sont vérifiés sur la blockchain avant d'être finalisés. |
| Pas de redirection vers des sites extérieurs | Aucun lien sortant. Le contact du promoteur se fait par un formulaire interne ; le numéro WhatsApp est seulement affiché et copiable. |
| Collecte de données limitée | Seuls l'identifiant d'application et le nom d'utilisateur Pi sont conservés. Ni e-mail, ni téléphone, ni position, ni adresse de portefeuille, ni phrase secrète. Politique de confidentialité en français et en anglais. |

## 4. Instructions pour l'équipe de revue

À coller dans le champ de notes pour les testeurs :

> **How to test Bio Star Monde Eden (Pi Testnet)**
> 1. Open the app in Pi Browser and tap "Connexion Pi" (top right). Approve the username and payments scopes.
> 2. Académie tab: open any module, read the lesson, tap "J'ai terminé ce module". Practical modules show "Demander la validation au formateur"; our trainers validate them within 24 hours (write to zoubgaefils@gmail.com to speed it up). Completing a course issues a certificate with a QR code; scan it to open the public verification page.
> 3. Marché tab: add "Tomates rondes" (0.2 test-π) to the cart, tap "Payer en Pi" and confirm in the wallet. The order appears as "Payée" under "Mes achats".
> 4. Bio-Lab tab: pick a crop and a symptom to get the organic treatment, then send a question with an optional photo to a field adviser.
> 5. Carbone tab: change the surfaces to see the carbon estimate.
>
> Lessons, recipes, diagnosis and the carbon estimator also work offline.

## 5. Liste de contrôle avant la soumission

- [ ] KYC Pi de M. ZOUGBA validé
- [ ] Application Testnet déployée, domaine vérifié (coche verte), clé API enregistrée
- [ ] `/api/health` affiche `"db":"supabase"` et `"piApiKey":true`
- [ ] Tous les tests de la section 5 de `docs/DEPLOIEMENT.md` réussis dans Pi Browser
- [ ] Au moins un paiement Testnet terminé et visible comme « Payée »
- [ ] Prix en Pi de chaque produit relus dans `/admin.html`
- [ ] Application Mainnet créée, portefeuille Mainnet connecté, domaine vérifié, nouvelle clé API
- [ ] Logo, 5 captures, descriptions, e-mail et adresses légales saisis dans la fiche
- [ ] Case « Pi SDK Exclusive Authentication » cochée

## 6. Limites connues de la version 1.0.0, à signaler si on vous le demande

| Point | État |
| --- | --- |
| Leçons audio en mooré, éwé et dioula | En cours d'enregistrement ; le texte de chaque leçon est déjà disponible. |
| Empreinte du passeport des produits | Calculée dans l'application (SHA-256) ; l'ancrage sur la blockchain Pi est prévu en version 1.1. |
| Remboursements | Traités par l'institut sous 14 jours ; l'automatisation par paiement de l'app vers l'utilisateur (A2U) est prévue en version 1.1. |
| Simulateur carbone | Estimation indicative ; aucun crédit carbone n'est émis ni vendu. |
