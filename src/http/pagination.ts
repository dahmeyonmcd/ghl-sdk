/** A single page of results plus enough info to decide whether/how to fetch the next one. */
export interface Page<TItem> {
  items: TItem[];
  /** Opaque cursor for the next page, when the endpoint uses cursor-based pagination. */
  nextCursor?: string;
  /** Total item count across all pages, when the endpoint reports it. */
  total?: number;
}

export interface PaginateCursorOptions<TItem> {
  fetchPage: (cursor: string | undefined) => Promise<Page<TItem>>;
}

/** Wraps a cursor-paginated list endpoint as an async generator yielding individual items. */
export async function* paginateCursor<TItem>(options: PaginateCursorOptions<TItem>): AsyncGenerator<TItem> {
  let cursor: string | undefined;
  for (;;) {
    const page = await options.fetchPage(cursor);
    for (const item of page.items) yield item;
    if (!page.nextCursor) return;
    cursor = page.nextCursor;
  }
}

export interface PaginateOffsetOptions<TItem> {
  limit?: number;
  fetchPage: (params: { skip: number; limit: number }) => Promise<TItem[]>;
}

/** Wraps a skip/limit-paginated list endpoint as an async generator yielding individual items. */
export async function* paginateOffset<TItem>(options: PaginateOffsetOptions<TItem>): AsyncGenerator<TItem> {
  const limit = options.limit ?? 100;
  let skip = 0;
  for (;;) {
    const items = await options.fetchPage({ skip, limit });
    for (const item of items) yield item;
    if (items.length < limit) return;
    skip += limit;
  }
}
