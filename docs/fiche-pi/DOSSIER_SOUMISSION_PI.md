# Fiche de l'application dans Pi — Bio Star Monde Éden

Tout ce qu'il faut saisir dans le Developer Portal (`develop.pi`, compte de M. ZOUBGA NATHANAËL) et dans la demande de référencement. Les textes destinés à l'équipe de revue de Pi sont donnés en français et en anglais : copiez-les tels quels.

L'approbation reste une décision de la Pi Core Team. Cochez d'abord [PI_APPROVAL_CHECKLIST.md](../../PI_APPROVAL_CHECKLIST.md).

## 1. Fiche

| Champ | Valeur |
| --- | --- |
| Nom | Bio Star Monde Éden |
| Version | 1.7.0 |
| Catégorie | Éducation (à défaut : Marketplace) |
| Propriétaire et promoteur | M. ZOUBGA NATHANAËL — Institut International Moderne Innovant Biologique d'Agriculture et d'Élevage |
| Développement et maintenance | Hilaila |
| E-mail de contact | zoubgaefils@gmail.com |
| Pays | Burkina Faso (siège de l'Institut) |
| Adresse de l'application | https://bio-star-monde.fra.appwrite.run |
| Confidentialité | https://bio-star-monde.fra.appwrite.run/privacy.html |
| Conditions | https://bio-star-monde.fra.appwrite.run/terms.html |
| Authentification | Pi uniquement : cochez « Pi SDK Exclusive Authentication » |
| Logo | `logo-1024.png` : logo officiel de l'Institut fourni par le promoteur (1024 × 1024 px, PNG, 335 Ko) |
| Image d'introduction | `0-intro.png` : logo, nom et devise de l'Institut (750 × 1500 px) |
| Captures | `1-accueil.png` à `5-attestation-verifiee.png` (750 × 1500 px, format demandé par la Pi Core Team) |

## 1 bis. Champs du portail (formulaire « Ecosystem Listing Application »)

| Champ du portail | À saisir |
| --- | --- |
| App Name (dans « App configuration ») | Bio Star Monde Éden |
| Version | 1.7.0 (sans « Version » ni point final) |
| Description (dans « App configuration ») | Texte ci-dessous |
| Intro Preview Image | `0-intro.png` (750 × 1500 px) |
| Previews | `1-accueil.png`, `2-academie.png`, `3-biosmart-diagnostic.png`, `4-tracabilite-lot.png`, `5-attestation-verifiee.png`, dans cet ordre |
| Pi Exclusive Transactions, Pi SDK Exclusive Authentication | Cochées |
| Developer Public Name | ZOUBGA NATHANAEL (orthographe de la pièce KYC) |
| Contact Email | facultatif ; l'application affiche zoubgaefils@gmail.com |
| PiOS Compatible | No |
| Pi Sign-In | Rien à remplir : il sert à se connecter avec Pi hors de Pi Browser, ce que l'application ne fait pas |

Format demandé par la Pi Core Team : 750 × 1500 px. Les 6 images à téléverser (`0-intro.png` et les 5 captures) ont exactement ce format, en PNG, et pèsent toutes moins de 1 Mo (la plus lourde, `0-intro.png`, fait 656 Ko). `logo-1024.png` (carré) reste disponible si un champ demande le logo seul.

**Description pour le portail (FR)**
> Application de l'Institut International Moderne Innovant Biologique d'Agriculture et d'Élevage (Burkina Faso). BioStar Academy : 9 formations agro-biologiques payées en Pi, avec attestation vérifiable par code QR. BioSmart : calendrier agricole, recettes de bio-intrants et diagnostic des cultures et des volailles. BioTrace : traçabilité des lots par code QR. BioImpact : estimation du carbone stocké dans les sols. Connexion et paiement uniquement avec Pi.

**Une adresse par application.** Pi ne vérifie une adresse que pour une seule application. `https://bio-star-monde.fra.appwrite.run` est réservée à l'application Mainnet, qui est celle à référencer ; l'application Testnet reçoit sa propre adresse (DEPLOIEMENT_APPWRITE.md, étape 7).

## 2. Descriptions

**Description courte (FR)**
> Formations agro-biologiques certifiantes, fiches BioSmart et traçabilité des lots, payées en Pi.

**Short description (EN)**
> Certified organic farming courses, BioSmart guides and farm lot traceability, paid in Pi.

**Description longue (FR)**
> Bio Star Monde Éden est l'application de l'Institut International Moderne Innovant Biologique d'Agriculture et d'Élevage, au Burkina Faso. Un seul compte Pi relie la formation du producteur, son exploitation, ses lots et son impact sur les sols.
>
> - BioStar Academy : 9 formations (compostage, biopesticides, biochar, aviculture, apiculture, pisciculture…). Inscription payée en Pi, leçons module par module, module pratique validé par le formateur, attestation vérifiable par code QR.
> - BioSmart : calendrier agricole du Burkina Faso et du Sud-Togo, recettes de bio-intrants dosées selon la surface, diagnostic des cultures et des volailles, avis d'un conseiller de l'Institut.
> - BioFarm Manager et BioTrace : fiche d'exploitation, parcelles et lots, avec une page publique de traçabilité et son code QR.
> - BioImpact : estimation du carbone stocké par le compost, le biochar, le zaï et l'agroforesterie.
>
> Connexion uniquement avec Pi. Paiement uniquement en Pi. Aucune publicité.

**Long description (EN)**
> Bio Star Monde Éden is the app of the International Modern Innovative Organic Institute of Agriculture and Livestock, in Burkina Faso. One Pi account links a farmer's training, farm, produce lots and soil impact.
>
> - BioStar Academy: 9 courses (composting, plant-based pesticides, biochar, poultry, beekeeping, fish farming…). Enrolment paid in Pi, lessons module by module, a practical module validated by a trainer, and a certificate verifiable by QR code.
> - BioSmart: farming calendar for Burkina Faso and southern Togo, organic input recipes scaled to the farmer's area, crop and poultry diagnosis, and advice from an Institute adviser.
> - BioFarm Manager and BioTrace: farm record, plots and lots, with a public traceability page and QR code.
> - BioImpact: estimate of the carbon stored by compost, biochar, zaï pits and agroforestry.
>
> Sign-in with Pi only. Payment in Pi only. No ads.

## 3. Conformité aux exigences du référencement Mainnet

| Exigence Pi | Dans Bio Star Monde Éden |
| --- | --- |
| Application complète, interface professionnelle | Catalogue, BioStar Academy, BioSmart, exploitation et lots, BioImpact, contact, administration. 2 suites de tests automatisés (`npm test`), serveur Node et fonction Appwrite. |
| KYC du développeur | Validé pour le compte Pi de M. ZOUBGA NATHANAËL (confirmé le 19 octobre 2026). |
| Pas d'usage abusif de la marque Pi | Nom sans « Pi ». Domaine `bio-star-monde…`, qui ne commence pas par « pi ». Logo officiel de l'Institut (BioStarMondeEden · IIMIBAE), sans élément de la marque Pi. |
| Connexion Pi uniquement | `Pi.authenticate(['username', 'payments'])`. Le jeton est vérifié par le serveur auprès de `https://api.minepi.com/v2/me` à chaque appel. Ni e-mail, ni mot de passe, ni autre fournisseur. |
| Transactions en Pi uniquement | Prix en Pi, `Pi.createPayment`, approbation et finalisation par le serveur avec la clé `PI_API_KEY`. Le prix vient du catalogue serveur ; montant, compte et transaction sont contrôlés auprès de Pi. Paiements incomplets repris. |
| Pas de redirection vers des sites extérieurs | Aucun achat ne se finalise hors de l'application. Le contact se fait par le formulaire interne « Écrire à l'Institut ». L'adresse e-mail n'apparaît en lien que dans les pages légales, pour l'exercice des droits. |
| Collecte de données limitée | Identifiant et nom d'utilisateur Pi, plus ce que l'utilisateur saisit lui-même. Ni téléphone, ni GPS, ni adresse de portefeuille, ni phrase secrète. Pages de traçabilité sans nom d'utilisateur. |

## 4. Instructions pour l'équipe de revue

À coller dans le champ de notes pour les testeurs :

> **How to test Bio Star Monde Éden (Pi Testnet)**
> 1. Open the app in Pi Browser and tap "Connexion Pi" (top right). Approve the username and payments scopes.
> 2. "Académie" tab (bottom bar): open "Production et usage du biochar" and tap the enrol button (0.3 test-π). After payment the lessons open. Read each module and tap "J'ai terminé ce module". The last module is practical: tap "Demander la validation au formateur"; our trainer validates it within 24 hours (write from "Écrire à l'Institut" to speed it up). A certificate code (ATT-…) and QR code are then issued; scan the QR to open the public verification page.
> 3. "Bio-Lab" tab: switch the calendar region, pick a recipe and change the area to see quantities, pick a crop and a symptom to get the organic treatment, then send a question to an adviser.
> 4. "Marché" tab, "Mon exploitation": create a farm, a plot and a lot; add steps; open the lot's public page and QR code.
> 5. "Carbone" tab: change the areas to see the carbon estimate.
> 6. "Accueil" tab, "Écrire à l'Institut": send a message to the Institute.

## 5. Visuels

| Fichier | Contenu |
| --- | --- |
| `0-intro.png` | Image d'introduction : logo, nom et devise de l'Institut, 750 × 1500 px |
| `logo-1024.png` | Logo officiel de l'Institut (BioStarMondeEden · IIMIBAE), 1024 × 1024 px |
| `1-accueil.png` | Accueil, connecté avec Pi |
| `2-academie.png` | Leçon d'une formation et progression |
| `3-biosmart-diagnostic.png` | Diagnostic par symptômes et traitement biologique |
| `4-tracabilite-lot.png` | Page publique d'un lot tracé |
| `5-attestation-verifiee.png` | Vérification publique d'une attestation |

Les 5 captures et l'image d'introduction font 750 × 1500 px.

Les captures montrent un compte de démonstration (`pionnier_demo`) et une ferme-école d'exemple.

## 6. Limites connues de la version 1.7.0

| Point | État |
| --- | --- |
| Contenus | Leçons, fiches BioSmart et prix proposés, à valider par le promoteur. |
| BioSmart | Fiches fondées sur des règles ; l'assistant d'intelligence artificielle viendra ensuite. |
| BioImpact | Estimation indicative ; aucun crédit carbone n'est émis ni vendu. |
| BioMarket | Pas encore ouvert : les produits de la ferme-école seront proposés quand elle produira. |
