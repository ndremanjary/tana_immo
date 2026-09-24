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
7. `tests/` — pagination, injection, panne de base, signature, doublon, CRM lent.

## Ce qui est fait

- Diagnostic des trois extraits (A sur le papier, B et C en code).
- `GET /api/listings` : ville en paramètre, jointure agence + photos, pagination fixe de 20, colonnes publiques seulement, erreur 500 sans détail interne.
- `POST /webhooks/payment` : signature HMAC SHA-256 (`X-Webhook-Signature`, hexadécimal minuscule ou majuscule), validation, transaction, réponse `200` avec le corps `ok`, puis email et CRM. Un drapeau par effet : un succès n'est pas rejoué, un échec est relancé au prochain envoi du même `id`.
- Tests de ces comportements.

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
