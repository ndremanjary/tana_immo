# TanàImmo — fiabilité de la plateforme

API Node.js / TypeScript des annonces et du webhook de paiement. Pas de PostgreSQL à installer : les requêtes sont les requêtes de production, exécutées par un simulateur en mémoire.

## Lancer

Node.js 20 ou plus.

```powershell
npm install
npm test
npm run typecheck
```

Démarrer l'API locale :

```powershell
$env:WEBHOOK_SECRET = "dev-secret-local-change"
$env:PORT = "3000"
npm start
```

Le secret fait au moins 16 caractères. Le fichier `.env` n'est pas lu tout seul : les variables viennent de l'environnement. `.env.example` indique les noms, sans valeur réelle.

Recherche :

```powershell
curl "http://127.0.0.1:3000/api/listings?city=Antananarivo&page=1"
```

## Où lire

1. `REPONSES.md` — problèmes des extraits A, B et C.
2. `src/listings/searchListings.ts` — extrait B corrigé.
3. `src/webhooks/paymentWebhook.ts` — extrait C corrigé.
4. `src/webhooks/signature.ts` — HMAC du corps brut.
5. `src/db/memoryDb.ts` — simulateur. En production ce module est remplacé par `pg`.
6. `src/db/indexes.sql` — index qui accompagnent la recherche et l'idempotence.
7. `src/crm/crmClient.ts` — `createLead`, timeout, réessais, clé d'idempotence.
8. `tests/crmClient.test.ts` — 429 puis succès, trois 500 puis abandon.

## Ce qui est fait

- Diagnostic des trois extraits (A sur le papier, B et C en code).
- `GET /api/listings` : ville en paramètre, jointure agence + photos, pagination fixe de 20, colonnes publiques seulement, erreur 500 sans détail interne.
- `POST /webhooks/payment` : signature HMAC SHA-256 (`X-Webhook-Signature`, hexadécimal minuscule ou majuscule), validation, transaction, réponse `200` avec le corps `ok`, puis email et CRM. Un drapeau par effet : un succès n'est pas rejoué, un échec est relancé au prochain envoi du même `id`.
- `createLead` : `POST https://crm.example.com/v1/leads`, jeton `CRM_TOKEN`. Timeout 5 s, 3 essais. Backoff exponentiel (200 ms, puis 400 ms) sur 500, 502, 503 et sur l'absence de réponse. Sur un 429, l'attente suit `Retry-After`. Un 400 ou un 401 s'arrête tout de suite. `Idempotency-Key` est le hash du lead, identique à chaque essai. Le jeton est retiré des messages d'erreur.
- `tests/crmClient.test.ts` : 429 puis 201 en respectant `Retry-After` ; trois 500 puis abandon, sans le jeton dans l'erreur ; un 400 n'est pas rejoué ; un timeout est rejoué puis accepté.

## Contrat utile au front

`GET /api/listings?city=Antananarivo&page=1` répond :

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

L'extrait A devra lire `items`, pas un tableau nu. `page` est optionnel et vaut 1. La comparaison de ville est exacte, comme un `=` PostgreSQL.

Le webhook attend un JSON signé sur les octets du corps :

```json
{
  "id": "evt-1",
  "type": "payment.succeeded",
  "booking_id": "book-1",
  "customer_email": "client@example.com"
}
```

Un autre `type`, s'il est signé et porte un `id`, reçoit `200` et n'est pas traité. Un paiement incomplet reçoit `400`.
