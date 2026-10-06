/**
 * Frozen source of truth for the 2026-10 Jeju event.
 *
 * The event runtime never fetches listings, PDFs or rule packages. The exact
 * reviewed dataset is bundled with the application and validated on load.
 */
import dataset from './jeju-event-2026-10-v1.json' with { type: 'json' };

export const activeEventDataset: unknown = dataset;
