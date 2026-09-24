type SearchRow = {
    id: string;
    title: string;
    price: number;
    city: string;
    created_at: string;
    agency_id: string | null;
    agency_name: string | null;
    photo_urls: string[];
};

type ListingQuery = {
    city: string;
    page: number;
};

export type { SearchRow, ListingQuery };