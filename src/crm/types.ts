type Lead = {
    listingId: string;
    name: string;
    phone: string;
    email: string;
    message: string;
};

type CreatedLead = {
    id: string;
    createdAt: string;
};

type CrmClientOptions = {
    /** Par défaut, `CRM_TOKEN` dans l'environnement. */
    token?: string;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    maxAttempts?: number;
    timeoutMs?: number;
    baseDelayMs?: number;
};

class CrmError extends Error {
    readonly status: number | null;

    constructor(message: string, status: number | null) {
        super(message);
        this.name = "CrmError";
        this.status = status;
    }
}

export type { Lead, CreatedLead, CrmClientOptions, };
export { CrmError };