type AgencyRecord = {
  id: string;
  name: string;
  /** Ne doit jamais sortir dans la réponse HTTP. */
  internalCommission: number;
};

export type ListingRecord = {
  id: string;
  title: string;
  price: number;
  city: string;
  agencyId: string | null;
  createdAt: Date;
  /** Ne doit jamais sortir dans la réponse HTTP. */
  internalNotes: string;
};

type PhotoRecord = {
  id: string;
  listingId: string;
  url: string;
};

export type BookingStatus = "pending" | "paid";

type BookingRecord = {
  id: string;
  status: BookingStatus;
};

type WebhookEventRecord = {
  id: string;
  receivedAt: string;
  emailSent: boolean;
  crmNotified: boolean;
};

export type DatabaseState = {
  agencies: AgencyRecord[];
  listings: ListingRecord[];
  photos: PhotoRecord[];
  bookings: BookingRecord[];
  events: WebhookEventRecord[];
};
