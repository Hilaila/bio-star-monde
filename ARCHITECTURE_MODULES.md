# Architecture des modules — une chaîne connectée

**BioStarMondeEden** — AGRO-BIOLOGIE • INTELLIGENCE ARTIFICIELLE • FORMATION • MARCHÉ • TRAÇABILITÉ

> « Former, innover, produire et commercialiser pour un monde agro-biologique durable »

L'application n'est ni un simple catalogue de formations ni une boutique agricole. Sa valeur tient aux liens entre les activités : ce qu'un module enregistre, le module suivant le réutilise.

## 1. Principe

1. **Un seul compte** : le compte Pi. Pas d'autre identifiant, pas de mot de passe.
2. **Un objet central** : la fiche d'exploitation. Tous les modules de production s'y rattachent.
3. **Des identifiants communs**, toujours les mêmes d'un module à l'autre.
4. **Une seule fonction Appwrite et une seule base** (`biostar`) : une table par objet.

## 2. Objets partagés

| Objet | Identifiant | Rattaché à | Créé par |
| --- | --- | --- | --- |
| Compte | nom d'utilisateur Pi | — | Connexion Pi |
| Inscription | `payment_id` | Compte | BioStar Academy (paiement en Pi) |
| Attestation | code `ATT-XXXXXXXX` | Compte, formation | BioStar Academy |
| Exploitation | `farm_id` | Compte (propriétaire) | BioFarm Manager |
| Parcelle | `plot_id` | Exploitation | BioFarm Manager |
| Recommandation | `advice_id` | Exploitation, parcelle | BioSmart |
| Essai | `trial_id` | Exploitation, parcelle | BioLab |
| Lot | `lot_id` | Exploitation, parcelle | BioTrace |
| Événement de lot | `event_id` | Lot | BioTrace (semis, intrant, récolte, transformation, vente) |
| Produit | `product_id` | Lot (obligatoire) | BioMarket |
| Action d'impact | `impact_id` | Exploitation | BioImpact |
| Partenaire | `partner_id` | — | BioPartners |

## 3. Les liens qui font la différence

| De | Vers | Ce qui circule |
| --- | --- | --- |
| BioStar Academy | BioFarm Manager, BioMarket | L'attestation apparaît sur la fiche d'exploitation et sur chaque produit (« producteur formé »). |
| BioSmart | BioFarm Manager | La recommandation retenue devient le plan de culture de la parcelle. |
| BioFarm Manager | BioTrace | Un lot naît toujours d'une parcelle identifiée. |
| BioLab | BioTrace | Les intrants testés (compost, biopesticides, biochar) sont cités dans l'historique du lot. |
| BioTrace | BioMarket | Pas de produit en vente sans lot tracé ; l'acheteur consulte l'historique. |
| BioMarket | BioImpact, Administration | Chaque vente alimente les recettes et le bilan de l'exploitation. |
| BioImpact | BioPartners | Les actions additionnées forment le rapport d'impact présenté aux partenaires. |
| Tous | Registre | Chaque utilisateur exporte toutes ses données (JSON) ; le promoteur exporte l'ensemble. |

## 4. Ordre de construction

1. **Fait** : catalogue, paiement en Pi, Mes inscriptions, Administration.
2. **Fait — socle** : fiche d'exploitation, parcelles, lots, étapes non modifiables, page publique `lot.html` avec code QR, formations du producteur affichées s'il l'accepte. Tout le reste s'y rattache.
3. **Fait — BioStar Academy** : leçons réservées aux inscrits (`core/academy.json`), progression, module pratique validé par le formateur, attestation vérifiable (`attestation.html`, code QR) affichée sur la fiche d'exploitation et, sur accord, sur la page des lots.
4. **Fait — BioSmart, fiches** : calendrier agricole (Burkina Faso, Sud-Togo), recettes de bio-intrants, diagnostic par symptômes, demande d'avis à un conseiller. **À venir** : validation des fiches par le promoteur, puis assistant d'intelligence artificielle.
5. **BioLab et BioImpact** : simulateur carbone ouvert (estimation indicative). **À venir** : essais et actions d'impact rattachés aux parcelles.
6. **BioMarket** : d'abord les produits de la ferme-école vendus par l'Institut, ensuite ceux des producteurs formés.
7. **BioPartners et Registre** : demandes de partenariat, rapports agrégés, export des données.

## 5. Contraintes à respecter

- **Pi Network** : connexion par Pi uniquement, paiements en Pi de l'utilisateur vers l'application, données réduites au strict nécessaire, aucune redirection vers un paiement extérieur.
- **BioMarket** : reverser des Pi à d'autres vendeurs suppose des paiements de l'application vers les utilisateurs, que Pi limite, et un cadre juridique. D'où le démarrage avec les seuls produits de l'Institut.
- **Intelligence artificielle** : un assistant appelle une API payante, côté serveur. On commence par des fiches fondées sur des règles validées par le promoteur ; l'assistant vient ensuite, avec un budget fixé.
- **Données personnelles** : la localisation des exploitations et les coordonnées des partenaires relèvent de la loi n°001-2021/AN ; déclaration à la CIL avant l'ouverture.
- **Contenus** : cours, fiches BioSmart et prix sont fournis et validés par M. ZOUGBA NATHANAËL.
