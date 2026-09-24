import type { DatabaseState, ListingRecord } from "./state.js";

/**
 * Jeu de données de démonstration.
 * 25 annonces à Antananarivo pour exercer la pagination,
 * une annonce à Toamasina pour vérifier le filtre,
 * des champs internes qui ne doivent pas fuir dans le JSON.
 */
export function createDemoState(): DatabaseState {
  const listings: ListingRecord[] = [];

  for (let index = 1; index <= 25; index += 1) {
    listings.push({
      id: `aty-${String(index).padStart(2, "0")}`,
      title: `Annonce ${index}`,
      price: 100_000 * index,
      city: "Antananarivo",
      agencyId: index % 2 === 0 ? "ag-2" : "ag-1",
      createdAt: new Date(Date.UTC(2026, 0, index)),
      internalNotes: index === 25 ? "secret-interne" : "",
    });
  }

  listings.push({
    id: "toa-01",
    title: "Villa Toamasina",
    price: 250_000_000,
    city: "Toamasina",
    agencyId: "ag-1",
    createdAt: new Date(Date.UTC(2026, 1, 1)),
    internalNotes: "secret-toa",
  });

  return {
    agencies: [
      { id: "ag-1", name: "Immo Jirama", internalCommission: 0.08 },
      { id: "ag-2", name: "Tanà Homes", internalCommission: 0.05 },
    ],
    listings,
    photos: [
      { id: "ph-1", listingId: "aty-25", url: "https://cdn.example/a.jpg" },
      { id: "ph-2", listingId: "aty-25", url: "https://cdn.example/b.jpg" },
    ],
    bookings: [
      { id: "book-1", status: "pending" },
      { id: "book-2", status: "pending" },
    ],
    events: [],
  };
}
