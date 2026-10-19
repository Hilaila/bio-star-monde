# Bio Star Monde Éden — organisation du projet

M. ZOUGBA NATHANAËL porte le projet et en détient les droits. Hilaila en assure la réalisation technique, selon l'accord conclu entre eux.

## Rôles

| Élément | Responsable |
| --- | --- |
| Promoteur de Bio Star Monde Éden | M. ZOUGBA NATHANAËL |
| Propriété du projet et droits associés | M. ZOUGBA NATHANAËL, selon l'accord entre les parties |
| Compte Pi Developer Portal | M. ZOUGBA NATHANAËL, promoteur enregistré |
| Dépôt GitHub et gestion technique | Hilaila |
| Développement et maintenance | Hilaila, selon l'accord entre les parties |
| Contact officiel | zoubgaefils@gmail.com |

## Comptes, clés et accès

| Accès | Titulaire | Utilisé par | Règle |
| --- | --- | --- | --- |
| Compte Pi Developer Portal | M. ZOUGBA NATHANAËL | M. ZOUGBA NATHANAËL | Enregistre les applications Testnet et Mainnet. KYC validé et portefeuille Mainnet migré obligatoires avant le lancement. |
| Portefeuille de l'application (Mainnet) | M. ZOUGBA NATHANAËL | — | Reçoit les paiements en Pi. Sa phrase secrète (passphrase) n'est jamais communiquée à personne, développeur compris. |
| Clés API Pi (Testnet, puis Mainnet) | Générées par M. ZOUGBA NATHANAËL | Hilaila, côté serveur | Transmises par un canal sécurisé, stockées uniquement dans la variable `PI_API_KEY` du serveur. Régénérées en cas de fuite ou de fin de collaboration. |
| Projet Supabase (base de données et fonction serveur) | M. ZOUGBA NATHANAËL, propriétaire | Hilaila, rôle Developer | M. ZOUGBA saisit lui-même le secret `PI_API_KEY` ; Hilaila déploie la base et la fonction. |
| Hébergement des pages (Vercel) | Hilaila | Hilaila | Ne contient aucun secret. Transfert à prévoir dans l'accord. |
| Clé de validation du domaine | Fournie par le Developer Portal | Hilaila | Variable `PI_VALIDATION_KEY`, servie sur `/validation-key.txt`. |
| Dépôt GitHub | Hilaila | Hilaila | Gestion technique. Accès en lecture recommandé pour le promoteur. |
| Hébergement et nom de domaine | À fixer dans l'accord | Hilaila | Le nom de domaine gagne à être enregistré au nom du promoteur ou de l'Institut, propriétaire du projet. |

Règles de sécurité :

1. Aucun secret (`.env`, clé API, phrase secrète, mot de passe) n'est envoyé par message non chiffré ni publié sur GitHub.
2. La clé API Testnet et la clé API Mainnet sont distinctes. Utiliser la clé Testnet en production fait échouer les paiements.
3. Chaque changement de personne ayant accès au serveur entraîne la régénération de la clé API.

## Accord à formaliser entre les parties

L'hébergement du dépôt sous le compte GitHub de Hilaila ne détermine pas, à lui seul, les droits juridiques sur le projet. L'accord écrit doit préciser :

- [ ] la cession ou la licence des droits sur le code au profit du promoteur ;
- [ ] le périmètre, la rémunération et la durée du développement et de la maintenance ;
- [ ] la liste des accès (GitHub, hébergement, nom de domaine, clés API) et leur remise en fin de collaboration ;
- [ ] les règles de confidentialité des clés et des données des apprenants.

Cet accord doit être relu par un juriste.
