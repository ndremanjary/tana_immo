# Réponses

Gravité : **Critique** (sécurité, perte ou doublon d'effet, indisponibilité), **Élevée** (bug fonctionnel majeur ou tenue en charge), **Moyenne** (robustesse ou affichage).

L'extrait A est corrigé ici seulement. Le code livré concerne B (`src/listings/searchListings.ts`) et C (`src/webhooks/paymentWebhook.ts`).

## Extrait A — liste d'annonces

| Problème | Gravité | Correction proposée |
|---|---|---|
| `useEffect` n'a pas de tableau de dépendances. Chaque `setState` relance le rendu, donc le fetch. Au premier succès, `loading` repasse à `false` et l'effet repart : boucle de requêtes. | Critique | Dépendance `[city]`. |
| Si `city` change avant la réponse, l'ancienne requête peut écraser la ville affichée. Rien n'annule le fetch au démontage. | Élevée | `AbortController` créé dans l'effet, `abort()` dans le nettoyage, ignorer `AbortError`. |
| Pas de `.catch`, pas de test `response.ok`. Un réseau coupé laisse « Chargement… » pour toujours. Un HTTP 500 parsé quand même est ensuite traité comme la liste. | Élevée | Branche d'erreur, `setLoading(false)` dans un `finally`, n'accepter le JSON que si `response.ok` et si c'est un tableau. |
| `city` est collé dans l'URL. Un espace ou un `&` casse la query string. | Moyenne | `encodeURIComponent(city)`. |
| Les `<li>` n'ont pas de `key`. React réutilise mal les lignes quand la liste change. | Moyenne | `key={l.id}` en supposant un identifiant stable. |
| `l.price.toLocaleString()` jette si `price` est absent, et `listings.map` jette si le corps n'est pas un tableau. L'écran tombe. | Élevée | Garder `[]` par défaut, n'afficher le prix que s'il est un nombre. Le contrat corrigé de l'API est `{ items, page, pageSize, total }` : le composant doit lire `items`. |

## Extrait B — `GET /api/listings`

| Problème | Gravité | Correction proposée |
|---|---|---|
| `city` est interpolé dans le SQL. `' OR '1'='1` (ou pire) change la requête. C'est une injection. | Critique | `WHERE l.city = $1`, valeur passée dans le tableau de paramètres. Jamais de concaténation. |
| `page` est lu et ignoré. Sans `LIMIT`, la route renvoie toute la ville. Sous le pic SMS, c'est le chemin le plus probable vers les 5xx et les 9 secondes. | Critique | Page de 20, `LIMIT $2 OFFSET $3`, `page` entier ≥ 1. Réponse `{ items, page, pageSize, total }`. Index `(city, created_at DESC, id DESC)` dans `src/db/indexes.sql`. |
| Une requête agence et une requête photos par annonce. 20 annonces deviennent une quarantaine d'allers-retours. | Élevée | Une recherche avec `LEFT JOIN` agences et photos, `json_agg` des URL, plus un `COUNT` séparé. Deux requêtes, pas N+1. |
| `SELECT *` renvoie les colonnes internes (notes, commission). Même en ne gardant que l'annonce, `row.agency = await db.query(...)` attache le résultat brut du driver, pas une agence. | Élevée | Colonnes publiques listées. L'agence devient `{ id, name }`, les photos une liste d'URL. |
| `city` peut être absent, vide, ou un tableau si le paramètre est répété. Aucune validation. | Élevée | `400` si `city` n'est pas une chaîne de 1 à 80 caractères, ou si `page` n'est pas un entier de 1 à 99999. |
| Aucun `try/catch`. Avec `node-postgres`, `db.query` renvoie un `Result` non itérable : `for...of` jette, et sans middleware d'erreur la promesse peut rester rejetée. Le message interne ne doit pas partir au client. | Élevée | Capturer, journaliser côté serveur, répondre `500` avec « Erreur interne. ». |

`OFFSET` profond reste coûteux. C'est assumé pour ce correctif ; un curseur sur `(created_at, id)` serait l'étape suivante si le catalogue grossit.

## Extrait C — `POST /webhooks/payment`

Le prestataire réessaie jusqu'à 5 fois s'il n'a pas un `200` en moins de 10 secondes.

| Problème | Gravité | Correction proposée |
|---|---|---|
| La route n'authentifie pas l'appelant. N'importe qui peut passer une réservation en `paid`. | Critique | HMAC SHA-256 du corps brut, en-tête `X-Webhook-Signature`, secret `WEBHOOK_SECRET`. Comparaison en temps constant. `401` sinon. |
| L'email puis le CRM (2 à 8 s) sont attendus avant le `200`. On dépasse souvent 10 s, le prestataire réessaie, la charge s'ajoute à la charge. | Critique | Transaction d'abord, `200` avec le corps `ok` tout de suite, effets ensuite. |
| Rien n'empêche de traiter deux fois le même événement. Le `UPDATE` est tolérant, l'email et `crm.notifyPayment` ne le sont pas : jusqu'à 5 reçus et 5 notifications. | Critique | `id` d'événement unique (`ON CONFLICT DO NOTHING`). Deux drapeaux, `email_sent` et `crm_notified`. Un effet déjà fait n'est pas rejoué. |
| Si l'email ou le CRM jette après le `UPDATE`, il n'y a pas de `200`, le prestataire réessaie, et l'effet déjà parti repart. L'échec n'est pas isolé. | Élevée | La réservation et l'id d'événement sont dans la même transaction, avant le `200`. Chaque effet est marqué fait seulement après succès, et remis à faire s'il échoue. Un CRM en échec ne renvoie pas l'email. |
| `booking_id` et `customer_email` ne sont pas vérifiés. Un corps vide ou tronqué part en base et vers l'email. | Élevée | `400` si le paiement n'a pas d'`id`, de `booking_id` et d'email. Un autre `type`, signé et identifiable, reçoit `200` pour arrêter les réessais, sans effet de bord. |
| `express.json()` consomme le corps et ne limite pas la taille. Sans les octets d'origine, la signature ne peut pas être vérifiée. | Élevée | `express.raw` sur cette route seule, limite 100 Ko. Pas de parser JSON global devant elle. |

Limite assumée : un rejeu du même corps est couvert par l'`id`. Une fenêtre de temps (horodatage dans la signature) n'est pas faite. Si le processus meurt après le `200` et avant un effet, le drapeau reste à faux et le prochain envoi le relance.

## Gestion d'incident

### Vendredi 21 h 40

Je décroche. Avant d'ouvrir un graphique : « Je vois l'alerte. Ça a démarré avec votre SMS de 21 h 30. Je stabilise d'abord, je vous rappelle dans dix minutes pour dire ce qui répond. » Je ne donne pas d'heure de correction. Le client a besoin de savoir que quelqu'un tient l'incident.

Je borne ensuite. Une médiane à 9 s, ce sont des requêtes qui attendent, pas un plantage sec. Je regarde si les 5xx et cette latence sont sur toute l'API ou seulement sur `GET /api/listings`, et si la courbe part vers 21 h 35. Si oui, c'est le SMS.

L'extrait B est en production. La campagne envoie tout le monde sur la recherche par ville. Cette route charge toute la ville, `page` est ignoré, puis une requête agence et une requête photos par annonce. Le pool de connexions se remplit, les fiches et le reste attendent, puis passent en 5xx. L'injection sur `city` est un trou réel sur cette route, mais un pic calé sur le SMS s'explique par la charge. Je la note pour demain matin. Je ne la cherche pas pendant que le site est à terre.

Je rends les connexions sans attendre le correctif. `statement_timeout` à 2 s sur le rôle de l'API : une recherche ne garde plus une connexion pendant 9 s. Devant l'API, vingt recherches en parallèle au plus, au-delà un 429 immédiat. Le nombre de serveurs reste celui du soir : la base est pleine, des processus en plus enverraient encore plus de requêtes. Bandeau sur le site : la recherche est dégradée, les fiches restent ouvertes.

Vers 21 h 50 : « La recherche saturait la base. Les requêtes trop longues sont coupées, le nombre de recherches en même temps est plafonné. Les fiches doivent s'ouvrir. La recherche peut encore échouer tant que le SMS amène du monde. La requête, je la corrige demain matin. »

Le lendemain, à froid : déployer la version bornée, paramètre `$1`, jointure, page de 20, index sur la ville et la date. Vérifier que les requêtes en rafale ont disparu et que la médiane est redescendue, puis seulement desserrer le timeout. Une page : horaire, ce qui était inutilisable, la cause, ce qui a tenu vendredi. Avant le prochain SMS, le client prévient, et on rejoue le volume avant d'envoyer.

### Avant le lancement

Grafana, le même endroit pour les quatre, pour être appelé avant les utilisateurs.

1. 5xx de l'API au-dessus de 1 % pendant 5 min. Le fond mesuré est à 0,1 %.
2. p95 de `GET /api/listings` au-dessus de 800 ms pendant 5 min.
3. Pool Postgres au-dessus de 70 % pendant 2 min.
4. Plus de 10 requêtes de recherche actives depuis plus d'1 s.

Les quatre me réveillent. La 3 et la 4 sonnent pendant que le site répond encore.
